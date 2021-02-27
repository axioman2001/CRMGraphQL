const Usuario = require('../models/Usuario');
const Producto = require('../models/Producto');
const Cliente = require('../models/Cliente');
const Pedido = require('../models/Pedido');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: 'variables.env' });


const crearToken = (usuario, secreta, expiresIn) => {
  console.log(usuario);
  const {id, email, nombre, apellido} = usuario;

  return jwt.sign({id, email, nombre, apellido}, secreta, {expiresIn})

}

//Resolvers
const resolvers = {
  Query: {
    obtenerUsuario: async(_, {}, ctx) => {   //{token}
      // const usuarioId = await jwt.verify(token, process.env.SECRETA);
      // return usuarioId;
      return ctx.usuario;
    },
    obtenerProductos: async () => {
      try {
        const productos = await Producto.find({});
        return productos;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerProducto: async (_, {id}) => {
      // Revisar si el producto existe

      const producto = await Producto.findById(id);

      if(!producto) {
        throw new Error('Producto no encontrado');
      }

      return producto;
    },
    obtenerClientes: async () => {
      try {
        const clientes = await Cliente.find({});
        return clientes;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerClientesVendedor: async (_, {}, ctx) => {
      try {
        const clientes = await Cliente.find({vendedor: ctx.usuario.id.toString()});
        return clientes;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerCliente: async (_, {id}, ctx) => {
      // Revisar si el cliente existe
      const cliente = await Cliente.findById(id);

      if (!cliente) {
        throw new Error('Cliente no encontrado');
      }

      // Solo el que creó al cliente puede veerlo
      if (cliente.vendedor.toString() !== ctx.usuario.id){
        throw new Error('No tiene las credenciales');
      }

      return cliente;
    },
    obtenerPedidos: async () => {
      try {
        const pedidos = await Pedido.find({});
        return pedidos;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerPedidosVendedor: async (_, {}, ctx) => {
      try {
        const pedidos = await Pedido.find({vendedor: ctx.usuario.id}).populate('cliente');

        console.log(pedidos);
        
        return pedidos;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerPedido: async (_, {id}, ctx) => {
      // Verificar existencia de pedido
      const pedido = await Pedido.findById(id);
      if(!pedido) {
        throw new Error('Pedido no hallado');
      }

      // Puede verlo solo el que lo creó
      if (pedido.vendedor.toString() !== ctx.usuario.id) {
        throw new Error('No tiene las credenciales');
      }

      // Retornar el resultado
      return pedido;

    },
    obtenerPedidosEstado: async (_, {estado}, ctx) => {
      const pedidos = await Pedido.find({vendedor: ctx.usuario.id, estado});

      return pedidos;
    },
    mejoresClientes: async () => {
      const clientes = await Pedido.aggregate([
        { $match : { estado: "COMPLETADO"}},
        { $group : {
          _id: "$cliente",
          total: {$sum: '$total'}
        }},
        {
          $lookup: {
            from: 'clientes',
            localField: '_id',
            foreignField: '_id',
            as: "cliente"
          }
        },
        {
          $limit: 10
        },
        {
          $sort : {total : -1}
        }
      ]);
      return clientes;
    },
    mejoresVendedores: async () => {
      const vendedores = await Pedido.aggregate([
        { $match : {estado: "COMPLETADO"}},
        { $group: {
          _id: "$vendedor",
          total: {$sum : '$total'}
        }},
        {
          $lookup: {
            from: 'usuarios',
            localField: '_id',
            foreignField: '_id',
            as: 'vendedor'
          }
        },
        {
          $sort: { total: -1 }
        },
        {
          $limit: 3
        }
      ]);

      return vendedores;
    },
    buscarProducto: async (_, {texto}) => {
      const productos = await Producto.find(
        {$text: { $search : texto}}).limit(5);

      return productos;
    }
  },
  Mutation: {
      nuevoUsuario: async (_, {input}) => {
        
        const { email, password } = input;
        //Revisar si el usuario ya está registrado
        const existeUsuario = await Usuario.findOne({email});
        //console.log(existeUsuario);
        if (existeUsuario) {
          throw new Error('El usuario ya está registrado');
        }

        //Hashear su password
        const salt = await bcryptjs.genSalt(10);
        input.password = await bcryptjs.hash(password, salt);
        
        try {
          //Guardarlo en la base de datos
          const usuario = new Usuario(input);
          usuario.save();
          return usuario;
        } catch (error) {
          console.log(error);          
        }
      },
      autenticarUsuario: async (_, {input}) => {

        const { email, password } = input;
        //Revisar si el usuario existe
        const existeUsuario = await Usuario.findOne({email});
        if (!existeUsuario) {
          throw new Error('El usuario NO está registrado');
        }

        //Revisar si el password es correcto
        const passwordCorrecto = await bcryptjs.compare(password, existeUsuario.password);
        if (!passwordCorrecto) {
          throw new Error('El password NO es correcto');
        }
        // Crear el token
        return {
          token: crearToken(existeUsuario, process.env.SECRETA, '24h')
        }
      },
      nuevoProducto: async (_, {input}) => {
        try {
          const producto = new Producto(input);

          //Almacenar en la bd
          const resultado = await producto.save();

          return resultado;
        } catch (error) {
          console.log(error);
        }
      },
      actualizarProducto: async (_, {id, input}) => {
        // Revisar si el producto existe

        let producto = await Producto.findById(id);

        if (!producto) {
          throw new Error('Producto no encontrado');
        }

        //Actualizarlo en la bd
        producto = await Producto.findOneAndUpdate({_id: id}, input, {new: true})

        return producto;
      },
      eliminarProducto: async (_, {id}) => {
        // Revisar si el producto existe

        let producto = await Producto.findById(id);

        if (!producto) {
          throw new Error('Producto no encontrado');
        }

        // Eliminar
        await Producto.findOneAndDelete({_id: id});

        return "Producto Eliminado";
      },
      nuevoCliente: async (_, {input}, ctx) => {

        console.log(ctx);
        // Verificar si ya existe el cliente
        //console.log(input);
        const { email } = input;
        const cliente = await Cliente.findOne({ email });
        if (cliente){
          throw new Error('Cliente ya creado');
        }
        const nuevoCliente = new Cliente(input);
        // Asignar el vendedor
        nuevoCliente.vendedor = ctx.usuario.id;


        // Guardarlo en la bd
        try {
          const resultado = await nuevoCliente.save();
          return resultado;  
        } catch (error) {
          console.log(error);
        }        
      },
      actualizarCliente: async (_, {id, input}, ctx) => {
        // Verificar si existe el cliente
        let cliente = await Cliente.findById(id);

        if (!cliente){
          throw new Error('Cliente no creado');
        }

        // Verificar si el vendedor con credenciales edita
        if (cliente.vendedor.toString() !== ctx.usuario.id) {
          throw new Error('No tiene las credenciales');
        }

        // Guardar el cliente
        cliente = await Cliente.findOneAndUpdate({_id: id}, input, {new: true});
        return cliente;
      },
      eliminarCliente: async (_, {id}, ctx) => {
        // Verificar si existe el cliente
        let cliente = await Cliente.findById(id);

        if (!cliente) {
          throw new Error('Cliente no creado');
        }

        // Verificar si el vendedor con credenciales edita
        if (cliente.vendedor.toString() !== ctx.usuario.id) {
          throw new Error('No tiene las credenciales');
        }

        // Eliminar Cliente
        await Cliente.findOneAndDelete({_id: id});

        return "Cliente Eliminado";
      },
      nuevoPedido: async (_, {input}, ctx) => {
        const {cliente} = input 
        
        // Verificar existencia de cliente
        let clienteExiste = await Cliente.findById(cliente);

        if (!clienteExiste) {
          throw new Error('Cliente no creado');
        }

        // Verificar si cliente es del vendedor
        if (clienteExiste.vendedor.toString() !== ctx.usuario.id) {
          throw new Error('No tiene las credenciales');
        }
        // Revisar el Stock
        //console.log(input.pedido);
        for await (const articulo of input.pedido) {
          //console.log(articulo);
          const {id} = articulo;
          
          const producto = await Producto.findById(id);
          //console.log(producto);
          if(articulo.cantidad > producto.existencia){
            throw new Error(`El articulo: ${producto.nombre} solicitado excede la existencia` )
          } else {
            // Restar el pedido a la existencia
            producto.existencia = producto.existencia - articulo.cantidad;

            await producto.save();
          }
        }

        // Crear Nuevo Pedido
        const nuevoPedido = new Pedido(input);

        // Asignar vendedor
        nuevoPedido.vendedor = ctx.usuario.id;

        // Guardar en la bd
        const resultado = await nuevoPedido.save();
        return resultado;
      },
      actualizarPedido: async(_, {id, input}, ctx) => {
        const {cliente} = input;
        // Verificar si pedido existe
        const existePedido = await Pedido.findById(id);
        if (!existePedido){
          throw new Error('El pedido no existe');
        }

        // Verificar si cliente existCliente
        const existeCliente = await Cliente.findById(cliente);
        if (!existeCliente) {
          throw new Error('El cliente no existe');
        }
        // Verificar si cliente pertenecen al vendedor
        if (existeCliente.vendedor.toString() !== ctx.usuario.id) {
          throw new Error('No tiene las credenciales');
        }
        // Revisar el Stock
        if(input.pedido){
          for await (const articulo of input.pedido) {
            //console.log(articulo);
            const { id } = articulo;

            const producto = await Producto.findById(id);
            //console.log(producto);
            if (articulo.cantidad > producto.existencia) {
              throw new Error(`El articulo: ${producto.nombre} solicitado excede la existencia`)
            } else {
              // Restar el pedido a la existencia
              producto.existencia = producto.existencia - articulo.cantidad;

              await producto.save();
            }
          }
        }
        
        // Guardar el pedido
        const resultado = await Pedido.findOneAndUpdate({_id: id}, input, {new:true});
        return resultado;
      },
      eliminarPedido: async (_, {id}, ctx) => {
        // Verificar si el pedido existe
        const pedido = await Pedido.findById(id);
        if(!pedido){
          throw new Error('El pedido no existe');
        }
        // Verificar si el pedido pertenece al vendedor
        if(pedido.vendedor.toString() !== ctx.usuario.id){
          throw new Error('No tiene credenciales');
        }
        // Eliminar el pedido
        await Pedido.findOneAndDelete({_id: id});
        return "Pedido Eliminado";
      }
  } 
}

module.exports = resolvers;