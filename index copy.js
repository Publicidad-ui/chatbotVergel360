// chatbot_vergel360/index.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const sessions = {};
const GOOGLE_SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxEECs8-dYbIM2Rd0lm7mehRdxZNibJYICotuOpHsxSxuSVe_tekDXlUTcgIiRH9efwxA/exec'; // Reemplaza con tu URL real

const variedadesDisponibles = [
  'Semilla Lechuga Patagonia', 'Semilla Lechuga Coolguard', 'Semilla Lechuga Salanova Triplex',
  'Semilla Lechuga Salanova Klee', 'Semilla Lechuga Salanova Pascal', 'Semilla Lechuga Salanova Expedition',
  'Semilla Lechuga Ballerina', 'Semilla Lechuga Verapaz', 'Semilla Lechuga Anthony', 'Semilla Lechuga Thurinus',
  'Semilla Lechuga Caipra', 'Semilla Lechuga Carmim', 'Semilla Espinaca Celia', 'Semilla Brocoli Avenger',
  'Semilla Brocoli Monclano', 'Semilla Coliflor Zaragoza', 'Semilla Coliflor Skywalker', 'Semilla Repollo Redma',
  'Semilla Repollo Kilazol', 'Semilla Cogollos Derbi', 'Semilla Lechuga Vera Peletizada',
  'Semilla Lechuga Scarlet', 'Remolacha', 'Lechuga Caipira', 'Rugula Roquette', 'Lechuga Jonction',
  'Perejil Crespo'
];

function esNumeroPositivo(valor) {
  return /^\d+$/.test(valor);
}

function esFechaValida(fecha) {
  const partes = fecha.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
  if (!partes) return false;

  const [dd, mm, yyyy] = fecha.split('/').map(Number);
  const dia = parseInt(dd, 10);
  const mes = parseInt(mm, 10);
  const anio = parseInt(yyyy, 10);

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;

  const diasPorMes = [31, (anio % 4 === 0 && anio % 100 !== 0) || (anio % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return dia <= diasPorMes[mes - 1];
}

function esTextoNoVacio(valor) {
  return valor && valor.trim().length > 0;
}

async function enviarAGoogleSheet(datos) {
  try {
    await axios.post(GOOGLE_SHEET_WEBHOOK_URL, datos);
    return true; // ✅ envío exitoso
  } catch (error) {
    console.error('❌ Error al enviar a Google Sheets:', error.message);
    return false; // ❌ falló el envío
  }
}


app.post('/webhook', (req, res) => {
  const from = req.body.From;
  const msgBody = req.body.Body?.trim();
  const twiml = new MessagingResponse();
  const msg = twiml.message();

  if (!sessions[from]) sessions[from] = { estado: null, proceso: null, datos: {} };
  const session = sessions[from];

  if (!esTextoNoVacio(msgBody)) {
    msg.body('❗ El campo no puede estar vacío. Por favor, escribe una respuesta.');
    return res.type('text/xml').send(twiml.toString());
  }

  if (msgBody.toLowerCase() === 'hola' || msgBody.toLowerCase() === 'inicio') {
    sessions[from] = { estado: null, proceso: null, datos: {} };
    msg.body(
      '👋 Hola, selecciona el proceso a registrar:\n' +
      '1. 🌱 Siembra\n2. 🧪 Mezcla\n3. 🚿 Riego\n4. 📦 Remisión'
    );
    return res.type('text/xml').send(twiml.toString());
  }

  const p = session.proceso;
  const s = session.estado;
  const d = session.datos;

  if (!p) {
    if (msgBody === '1' || msgBody.toLowerCase().includes('siembra')) {
      session.proceso = 'siembra';
      session.estado = 'variedad';
      const opciones = variedadesDisponibles.map((v, i) => `${i + 1}. ${v}`).join('\n');
      msg.body(`🌱 Proceso de Siembra\nSelecciona la variedad:\n${opciones}`);
    } else if (msgBody === '2' || msgBody.toLowerCase().includes('mezcla')) {
      session.proceso = 'mezcla';
      session.estado = 'fecha';
      msg.body('🧪 Proceso de Mezcla\n📅 Ingresa la fecha (dd/mm/aaaa):');
    } else if (msgBody === '3' || msgBody.toLowerCase().includes('riego')) {
      session.proceso = 'riego';
      session.estado = 'fecha';
      msg.body('🚿 Proceso de Riego\n📅 Ingresa la fecha (dd/mm/aaaa):');
    } else if (msgBody === '4' || msgBody.toLowerCase().includes('remision')) {
      session.proceso = 'remision';
      session.estado = 'fecha';
      msg.body('📦 Proceso de Remisión\n📅 Ingresa la fecha (dd/mm/aaaa):');
    } else {
      msg.body('❗ Opción inválida. Escribe "inicio" para comenzar.');
    }
    return res.type('text/xml').send(twiml.toString());
  }

  const continuar = () => res.type('text/xml').send(twiml.toString());

  const pedirBandeja = () => msg.body('📌 Tipo de bandeja:\n1. Bandeja de 128\n2. Bandeja de 200');

  const guardarYMostrar = async (proceso) => {
  d.proceso = proceso;
  const exito = await enviarAGoogleSheet(d);
  
  if (exito) {
    msg.body(`✅ *Registro de ${proceso} exitoso.* Los datos fueron enviados a la hoja de cálculo.\n\n📋 *Resumen del registro:*\n${Object.entries(d).map(([k, v]) => `• ${k}: ${v}`).join('\n')}\n\nEscribe "inicio" para registrar otro proceso.`);
  } else {
    msg.body(`⚠️ *Registro de ${proceso} completado,* pero ocurrió un error al enviar los datos a la hoja de cálculo. Por favor, intenta nuevamente o contacta soporte.`);
  }

  delete sessions[from];
  return continuar();
};

  if (p === 'siembra') {
    if (s === 'variedad') {
      const i = parseInt(msgBody);
      if (!isNaN(i) && i >= 1 && i <= variedadesDisponibles.length) {
        d.variedad = variedadesDisponibles[i - 1];
        session.estado = 'semillas';
        msg.body('📌 Cantidad de semillas:');
      } else msg.body(`❗ Elige un número entre 1 y ${variedadesDisponibles.length}`);
    } else if (s === 'semillas') {
      if (!esNumeroPositivo(msgBody)) msg.body('❗ Ingresa un número válido.');
      else { d.semillas = msgBody; session.estado = 'bandeja'; pedirBandeja(); }
    } else if (s === 'bandeja') {
      if (msgBody === '1' || msgBody === '2') {
        d.bandeja = msgBody === '1' ? 'Bandeja de 128' : 'Bandeja de 200';
        session.estado = 'cantidad_bandejas';
        msg.body('📌 Cantidad de bandejas:');
      } else pedirBandeja();
    } else if (s === 'cantidad_bandejas') {
      if (!esNumeroPositivo(msgBody)) msg.body('❗ Número inválido.');
      else { d.cantidad_bandejas = msgBody; session.estado = 'fecha_liberacion'; msg.body('📅 Fecha estimada de liberación (dd/mm/aaaa):'); }
    } else if (s === 'fecha_liberacion') {
      if (!esFechaValida(msgBody)) msg.body('❗ Fecha inválida. Usa dd/mm/aaaa.');
      else { d.fecha_liberacion = msgBody; session.estado = 'responsable'; msg.body('👤 Responsable de la siembra:'); }
    } else if (s === 'responsable') {
      if (!esTextoNoVacio(msgBody)) msg.body('❗ Campo obligatorio.');
      else { d.responsable = msgBody; return guardarYMostrar('Siembra'); }
    }
    return continuar();
  }

  if (p === 'mezcla') {
    if (s === 'fecha') {
      if (!esFechaValida(msgBody)) msg.body('❗ Fecha inválida. Usa dd/mm/aaaa.');
      else { d.fecha = msgBody; session.estado = 'turba'; msg.body('📌 Bultos de turba:'); }
    } else if (s === 'turba') {
      if (!esNumeroPositivo(msgBody)) msg.body('❗ Número inválido.');
      else { d.turba = msgBody; session.estado = 'cascarilla'; msg.body('📌 Bultos de cascarilla:'); }
    } else if (s === 'cascarilla') {
      if (!esNumeroPositivo(msgBody)) msg.body('❗ Número inválido.');
      else { d.cascarilla = msgBody; session.estado = 'progro'; msg.body('📌 Gramos de Progro:'); }
    } else if (s === 'progro') {
      if (!esNumeroPositivo(msgBody)) msg.body('❗ Número inválido.');
      else { d.progro = msgBody; session.estado = 'bandeja'; pedirBandeja(); }
    } else if (s === 'bandeja') {
      if (msgBody === '1' || msgBody === '2') {
        d.bandeja = msgBody === '1' ? 'Bandeja de 128' : 'Bandeja de 200';
        session.estado = 'cantidad_bandejas';
        msg.body('📌 Cantidad total de bandejas:');
      } else pedirBandeja();
    } else if (s === 'cantidad_bandejas') {
      if (!esNumeroPositivo(msgBody)) msg.body('❗ Número inválido.');
      else { d.cantidad_bandejas = msgBody; session.estado = 'responsable'; msg.body('👤 Responsable de la mezcla:'); }
    } else if (s === 'responsable') {
      if (!esTextoNoVacio(msgBody)) msg.body('❗ Campo obligatorio.');
      else { d.responsable = msgBody; return guardarYMostrar('Mezcla'); }
    }
    return continuar();
  }

  if (p === 'riego') {
    if (s === 'fecha') {
      if (!esFechaValida(msgBody)) msg.body('❗ Fecha inválida. Usa dd/mm/aaaa.');
      else { d.fecha = msgBody; session.estado = 'invernadero'; msg.body('📌 Número de invernadero:'); }
    } else if (s === 'invernadero') {
      if (!esTextoNoVacio(msgBody)) msg.body('❗ Campo obligatorio.');
      else { d.invernadero = msgBody; session.estado = 'ocupacion'; msg.body('📌 Ocupación del invernadero:'); }
    } else if (s === 'ocupacion') {
      if (!esTextoNoVacio(msgBody)) msg.body('❗ Campo obligatorio.');
      else { d.ocupacion = msgBody; session.estado = 'insumos'; msg.body('📌 Insumos usados:'); }
    } else if (s === 'insumos') {
      if (!esTextoNoVacio(msgBody)) msg.body('❗ Campo obligatorio.');
      else { d.insumos = msgBody; session.estado = 'agua'; msg.body('📌 Cantidad de agua aplicada:'); }
    } else if (s === 'agua') {
      if (!esNumeroPositivo(msgBody)) msg.body('❗ Número inválido.');
      else { d.agua = msgBody; session.estado = 'observaciones'; msg.body('📌 Observaciones:'); }
    } else if (s === 'observaciones') {
      if (!esTextoNoVacio(msgBody)) msg.body('❗ Campo obligatorio.');
      else { d.observaciones = msgBody; session.estado = 'responsable'; msg.body('👤 Responsable del riego:'); }
    } else if (s === 'responsable') {
      if (!esTextoNoVacio(msgBody)) msg.body('❗ Campo obligatorio.');
      else { d.responsable = msgBody; return guardarYMostrar('Riego'); }
    }
    return continuar();
  }

  if (p === 'remision') {
    if (s === 'fecha') {
      if (!esFechaValida(msgBody)) msg.body('❗ Fecha inválida. Usa dd/mm/aaaa.');
      else { d.fecha = msgBody; session.estado = 'numero'; msg.body('📌 Número de remisión:'); }
    } else if (s === 'numero') {
      if (!esTextoNoVacio(msgBody)) msg.body('❗ Campo obligatorio.');
      else { d.numero = msgBody; session.estado = 'cliente'; msg.body('📌 Cliente:'); }
    } else if (s === 'cliente') {
      if (!esTextoNoVacio(msgBody)) msg.body('❗ Campo obligatorio.');
      else { d.cliente = msgBody; session.estado = 'producto'; msg.body('📌 Producto:'); }
    } else if (s === 'producto') {
      if (!esTextoNoVacio(msgBody)) msg.body('❗ Campo obligatorio.');
      else { d.producto = msgBody; session.estado = 'responsable'; msg.body('👤 Encargado del despacho:'); }
    } else if (s === 'responsable') {
      if (!esTextoNoVacio(msgBody)) msg.body('❗ Campo obligatorio.');
      else { d.responsable = msgBody; session.estado = 'factura'; msg.body('📌 Factura SIIGO:'); }
    } else if (s === 'factura') {
      if (!esTextoNoVacio(msgBody)) msg.body('❗ Campo obligatorio.');
      else { d.factura = msgBody; return guardarYMostrar('Remisión'); }
    }
    return continuar();
  }

  msg.body('🤖 Escribe "inicio" para comenzar.');
  return continuar();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Bot activo en puerto ${PORT}`));
