// chatbot_vergel360/index.js
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { MessagingResponse } = require("twilio").twiml;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

require("dotenv").config();

const sesiones = {};

/* MENÚ DESDE PLANTILLA TWILIO */
const qs = require("querystring");

function isSandbox() {
  return (process.env.TWILIO_WHATSAPP_FROM || "").trim() === "whatsapp:+14155238886";
}

async function enviarMenuBotones({ to, msg, res, twiml }) {
  // SANDBOX
  if (isSandbox()) {
    msg.body("👋 Hola, selecciona el proceso a registrar: \n1. Mezcla\n2. Siembra\n(Escribe la opción)");
    res.type("text/xml").send(twiml.toString());
    return;
  }

  // PROD
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${(process.env.TWILIO_ACCOUNT_SID||"").trim()}/Messages.json`;
    const form = qs.stringify({
      To: to,
      From: (process.env.TWILIO_WHATSAPP_FROM || "").trim(),
      ContentSid: (process.env.CONTENT_SID_MENU || "").trim()
    });

    const r = await axios.post(url, form, {
      auth: {
        username: (process.env.TWILIO_ACCOUNT_SID || "").trim(),
        password: (process.env.TWILIO_AUTH_TOKEN || "").trim()
      },
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    console.log("[menu] Content enviado, sid:", r.data.sid);
    res.sendStatus(204).end();
  } catch (e) {
    console.error("[menu] ERROR Content:", e?.response?.data || e.message);
    msg.body("👋 Hola, selecciona el proceso a registrar: \n1. Mezcla\n2. Siembra\n(Escribe la opción)");
    res.type("text/xml").send(twiml.toString());
  }
}

async function enviarConfirmarFecha({ to, fecha, msg, res, twiml }) {
  // SANDBOX → caer a texto (como ya haces)
  if (isSandbox()) {
    msg.body(
      `📅 La *fecha del reporte* será *hoy*: ${fecha}\n` +
      `¿Desea *confirmar* o *cambiar* la fecha?\n\n` +
      `1. Confirmar (hoy)\n` +
      `2. Cambiar (ingresará la fecha)`
    );
    res.type("text/xml").send(twiml.toString());
    return;
  }

  // PRODUCCIÓN → Content API
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${(process.env.TWILIO_ACCOUNT_SID||"").trim()}/Messages.json`;
    const form = qs.stringify({
      To: to,
      From: (process.env.TWILIO_WHATSAPP_FROM || "").trim(),
      ContentSid: (process.env.CONTENT_SID_CONFIRMAR_FECHA || "").trim(),
      // tu plantilla usa {{fecha}} para la fecha
      ContentVariables: JSON.stringify({ "fecha": fecha })
    });

    const r = await axios.post(url, form, {
      auth: {
        username: (process.env.TWILIO_ACCOUNT_SID || "").trim(),
        password: (process.env.TWILIO_AUTH_TOKEN || "").trim()
      },
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    console.log("[confirmar_fecha] Content enviado, sid:", r.data.sid);
    res.sendStatus(204).end();
  } catch (e) {
    console.error("[confirmar_fecha] ERROR Content:", e?.response?.data || e.message);
    // Fallback a texto si falla el Content
    msg.body(
      `📅 La *fecha del reporte* será *hoy*: ${fecha}\n` +
      `¿Desea *confirmar* o *cambiar* la fecha?\n\n` +
      `1. Confirmar (hoy)\n` +
      `2. Cambiar (ingresará la fecha)`
    );
    res.type("text/xml").send(twiml.toString());
  }
}


function getChoiceFromRequest(req, fallbackText) {
  // Quick Reply / Buttons
  const btnIdRaw =
    req.body?.ButtonResponse?.id ||
    req.body?.Interactive?.Button?.Reply?.Id ||
    null;

  // List Picker
  const listIdRaw =
    req.body?.list_reply?.id ||
    req.body?.Interactive?.List?.Id ||
    null;

    const choice = btnIdRaw || listIdRaw || fallbackText;
    console.log("🔍 Choice detectado:", choice);

  const btnId  = btnIdRaw  ? String(btnIdRaw).trim().toLowerCase()  : null;
  const listId = listIdRaw ? String(listIdRaw).trim().toLowerCase() : null;

  if (btnId)  return btnId;
  if (listId) return listId;

  return String(fallbackText || '').trim().toLowerCase();
}


////

//HELPERS
function hoyDDMMYYYY() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function esEnteroNoNegativo(v) {
  return /^\d+$/.test(String(v));
}

function esNumeroPositivo(valor) {
  return /^\d+(\.\d+)?$/.test(valor);
}

function esFechaValida(fecha) {
  const partes = fecha.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
  if (!partes) return false;

  const [dd, mm, yyyy] = fecha.split("/").map(Number);
  const dia = parseInt(dd, 10);
  const mes = parseInt(mm, 10);
  const anio = parseInt(yyyy, 10);

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;

  const diasPorMes = [
    31,
    (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return dia <= diasPorMes[mes - 1];
}

function esTextoNoVacio(valor) {
  return valor && valor.trim().length > 0;
}

// Normaliza texto (para búsqueda por nombre)
function norm(s) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function parseRangosIndices(input, max) {
  // input: "1,3,5-10" (1-based)
  const s = String(input || "").trim().replace(/\s+/g, "");
  if (!s) return { ok:false, error:"Vacío" };

  const parts = s.split(",").filter(Boolean);
  const set = new Set();

  for (const part of parts) {
    // rango 5-10
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) {
      let a = Number(m[1]), b = Number(m[2]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (a > b) [a,b] = [b,a];
      for (let i=a; i<=b; i++) set.add(i);
      continue;
    }

    // número simple
    if (/^\d+$/.test(part)) set.add(Number(part));
    else return { ok:false, error:`Formato inválido: "${part}"` };
  }

  const out = [...set].sort((x,y)=>x-y);
  // validar rango
  const bad = out.find(n => n < 1 || n > max);
  if (bad) return { ok:false, error:`Número fuera de rango: ${bad} (1-${max})` };

  return { ok:true, indices: out }; // 1-based
}


// === API helpers ===
async function enviarAGoogleSheet(datos) {
  // Llama a la variable correspondiente según el proceso
  let url;

  // Usa la variable de la URL directamente según el proceso
  switch (datos.proceso) {
    case "siembra":
      url = process.env.SIEMBRA_URL;
      break;
    case "mezcla": 
      url = process.env.MEZCLA_URL;
      break;
    default:
      throw new Error(`No existe URL para el proceso: ${datos.proceso}`);
  }

  try {
    // Enviar los datos a la URL correspondiente
    console.log("Datos enviados:", datos);
    await axios.post(url, datos);
    return true;
  } catch (error) {
    console.error(`Error al enviar a ${datos.proceso}:`, error.message);
    return false;
  }
}

async function getResponsables() {
  const url = (process.env.RESPONSABLES_URL || "").trim();
  console.log("[RESP] GET", url);
  try {
    const r = await axios.get(url, { timeout: 30000, validateStatus: () => true });
    const ct = r.headers?.['content-type'] || '';
    console.log("[RESP] status:", r.status, "| content-type:", ct);

    if (ct.includes('text/html')) {
      console.warn("[RESP] Recibí HTML (login). Web App no público.");
      return [];
    }

    const data = r.data;
    if (data && data.ok && Array.isArray(data.items)) {
      // Asegurar forma {id, nombre}
      const items = data.items
        .map(it => ({
          id: String(it.id ?? '').trim(),
          nombre: String(it.nombre ?? it.Nombre ?? it.label ?? '').trim()
        }))
        .filter(it => it.id && it.nombre);
      console.log("[RESP] items.count =", items.length);
      return items;
    }
    console.warn("[RESP] formato inesperado, retorno []");
    return [];
  } catch (e) {
    console.error("[RESP] ERROR", e?.response?.status, e?.response?.data || e.message);
    return [];
  }
}

async function apiGetSiembra(url, params = {}) {
  try {
    const r = await axios.get(url, { params, timeout: 30000, validateStatus: () => true });
    if (r.status !== 200) {
      console.warn("[API] status", r.status, r.data);
      return null;
    }
    return r.data;
  } catch (e) {
    console.error("[API] GET error:", e.message);
    return null;
  }
}

async function getVariedades() {
  const base = (process.env.SIEMBRA_API_BASE || "").trim();
  if (!base) return [];
  const data = await apiGetSiembra(base, { action: "variedades" });
  if (!data || !data.ok || !Array.isArray(data.items)) return [];
  // Normalizo {id, nombre}
  return data.items
    .map(it => ({ id: String(it.id||"").trim(), nombre: String(it.nombre||"").trim() }))
    .filter(x => x.id && x.nombre);
}

async function getEmpaquesPorVariedad(variedadId) {
  const base = (process.env.SIEMBRA_API_BASE || "").trim();
  if (!base || !variedadId) return [];
  const data = await apiGetSiembra(base, { action: "empaques", variedad_id: variedadId });
  if (!data || !data.ok || !Array.isArray(data.items)) return [];
  // Esperamos {id, codigo, stock_disponible}
  return data.items
    .map(it => ({
      id: String(it.id||"").trim(),
      codigo: String(it.codigo||"").trim(),
      stock_disponible: Number(it.stock_disponible||0)
    }))
    .filter(x => x.id && x.codigo);
}

async function getBandejas() {
  const base = (process.env.SIEMBRA_API_BASE || "").trim();
  if (!base) return [];
  const data = await apiGetSiembra(base, { action: "bandejas" });
  if (!data || !data.ok || !Array.isArray(data.items)) return [];
  // Esperamos {id, nombre, cantidad}
  return data.items
    .map(it => ({
      id: String(it.id||"").trim(),
      nombre: String(it.nombre||"").trim(),   
      cantidad: Number(it.cantidad||0)        
    }))
    .filter(x => x.id && x.nombre && x.cantidad>0);
}

async function getCapacidad({ cavidades, empaque_id }) {
  const base = (process.env.SIEMBRA_API_BASE || "").trim(); 
  const data = await apiGetSiembra(base, { action: "capacidad", cavidades, empaque_id, debug:"1" });
  if (!data || !data.ok) {
    return { ok:false, error: data?.error || 'Error consultando capacidad' };
  }
  return { ok:true, ...data };
}



// Renderiza lista numerada (corta en N ítems)
function renderLista(items, mapLabel, max = 10) {
  const top = items.slice(0, max);
  const body = top.map((it, i) => `${i + 1}. ${mapLabel(it)}`).join("\n");
  const plus = items.length > max ? `\n… y ${items.length - max} más` : "";
  return body + plus;
}

////

app.post("/webhook", async(req, res) => {
  console.log("📩 Webhook recibido:");
  console.log(JSON.stringify(req.body, null, 2));
  const from = req.body.From;
  const texto = (req.body.Body || "").trim();
  const twiml = new MessagingResponse();
  const msg = twiml.message();

  if (!sesiones[from])
    sesiones[from] = { estado: null, proceso: null, datos: {} };
  const sesion = sesiones[from];

  if (!texto) {
    msg.body("❗ El campo no puede estar vacío.");
    return res.type("text/xml").send(twiml.toString());
  }

  // Enviar MENÚ con botones usando tu ContentSid
  if (/^(hola|inicio)$/i.test(texto)) {
  sesiones[from] = { estado: null, proceso: null, datos: {} };
  return enviarMenuBotones({ to: from, msg, res, twiml });
}

///
  const { proceso, estado, datos } = sesion;

  // Si viene ya una elección (por texto o botón), procesa:
  if (!proceso) {
    const choice = getChoiceFromRequest(req, texto); // "mezcla" / "siembra" / "1" / "2"
    const hoy = hoyDDMMYYYY();
    switch (choice) {
      case "1":
      case "mezcla":
        sesion.proceso = "mezcla";
        sesion.estado = "mezcla_confirmar_fecha";
        await enviarConfirmarFecha({ to: from, fecha: hoyDDMMYYYY(), msg, res, twiml });
        return;

      case "2":
      case "siembra":
        sesion.proceso = "siembra";
        sesion.estado = "siembra_confirmar_fecha";
        await enviarConfirmarFecha({ to: from, fecha: hoyDDMMYYYY(), msg, res, twiml });
        return;

      default:
      // si no entendió, reenvía menú
      await enviarMenuBotones({ to: from, msg, res, twiml });
      return;
    }
  }

////

// ====== FLUJO: MEZCLA ======
if (sesion?.proceso === "mezcla") {
  const datos = (sesion.datos ||= {});
  const estado = sesion.estado;

  // (1) Confirmar/Cambiar fecha
  if (estado === "mezcla_confirmar_fecha") {
    const choice = getChoiceFromRequest(req, texto);
    const hoy = hoyDDMMYYYY();
    if (choice === "confirmar_fecha" || choice === "1" ||choice === "confirmar (hoy)") {
      datos.fecha = hoy;
      sesion.estado = "mezcla_responsable";
      try {
        const lista = await getResponsables() ;
        if (!lista.length) {
          msg.body("No hay responsables en la BD. Contacta a sistemas.");
          return res.type("text/xml").send(twiml.toString());
        }
        // Guardamos la lista en la sesion (para index)
        sesion._responsables = lista;
        const enumerado = lista.map((it,i)=>`${i+1}. ${it.nombre}`).join("\n");
        msg.body(
          `👤 Responsable de la mezcla\n` +
          `Elige por número o escribe el nombre para buscar:\n\n` +
          `${enumerado}`
        );
      } catch (e) {
        console.error("Error cargando responsables:", e?.response?.data || e.message);
        msg.body("⚠️ No se pudo cargar la lista de responsables. Intenta más tarde.");
      }
      return res.type("text/xml").send(twiml.toString());
    }

    if (choice === "cambiar_fecha" || choice === "2" || choice === "cambiar fecha") {
      sesion.estado = "mezcla_fecha_manual";
      msg.body("📅 Escriba la *fecha del reporte* (dd/mm/aaaa):");
      return res.type("text/xml").send(twiml.toString());
    }

    // Cualquier otra cosa reenvía la plantilla
    await enviarConfirmarFecha({ to: from, fecha: hoy, msg, res, twiml });
    return;
  }

  // (1b) Fecha manual
  if (estado === "mezcla_fecha_manual") {
    if (!esFechaValida(texto)) {
      msg.body("❗ Formato inválido. Use *dd/mm/aaaa*. Ej: 16/10/2025");
      return res.type("text/xml").send(twiml.toString());
    }
    datos.fecha = texto;
    sesion.estado = "mezcla_responsable";
    try {
      const lista = await getResponsables();
      if (!lista.length) {
        msg.body("No hay responsables en la BD. Contacta a sistemas.");
        return res.type("text/xml").send(twiml.toString());
      }
      sesion._responsables = lista;
      const enumerado = lista.map((it,i)=>`${i+1}. ${it.nombre}`).join("\n");
      msg.body(
        `👤 Responsable de la mezcla\n` +
        `Elija por número o escriba el nombre para buscar:\n\n` +
        `${enumerado}`
      );
    } catch (e) {
      console.error("Error cargando responsables:", e?.response?.data || e.message);
      msg.body("⚠️ No se pudo cargar la lista de responsables. Intenta más tarde.");
    }
    return res.type("text/xml").send(twiml.toString());
  }

  // (2) Responsable: número o texto (búsqueda aproximada simple)
      if (estado === "mezcla_responsable") {
      let lista = sesion._responsables || [];
      if (!lista.length) {
        msg.body("⚠️ No hay responsables disponibles. Escriba *inicio* para reiniciar.");
        return res.type("text/xml").send(twiml.toString());
      }

      // Soportar ambos formatos:
      const isObj = typeof lista[0] === "object" && lista[0] !== null && ("id" in lista[0] || "nombre" in lista[0]);
      const getNombre = (it) => isObj ? it.nombre : String(it);
      const getId     = (it) => isObj ? it.id     : String(it); // si viniera string, usamos el mismo valor como "id" por compat

      // Si enviaron número dentro de rango
      if (/^\d+$/.test(texto)) {
        const idx = Number(texto) - 1;
        if (idx >= 0 && idx < lista.length) {
          const sel = lista[idx];
          datos.responsable_key    = getId(sel);
          datos.responsable_nombre = getNombre(sel);

          sesion.estado = "mezcla_turba";
          msg.body("🪵 Cantidad de *bultos de turba* (entero ≥ 0):");
          return res.type("text/xml").send(twiml.toString());
        }
        msg.body(`Número fuera de rango (1-${lista.length}). Intente de nuevo.`);
        return res.type("text/xml").send(twiml.toString());
      }

      // Si enviaron texto: búsqueda por inclusión
      const q = norm(texto);
      const hits = lista
        .map((item, i) => ({ item, i }))
        .filter(x => norm(getNombre(x.item)).includes(q));

      if (hits.length === 1) {
        const sel = hits[0].item;
        datos.responsable_key    = getId(sel);
        datos.responsable_nombre = getNombre(sel);

        sesion.estado = "mezcla_turba";
        msg.body(`✅ Responsable: *${datos.responsable_nombre}*\n\n🪵 Bultos de *turba* (entero ≥ 0):`);
        return res.type("text/xml").send(twiml.toString());
      }

      if (hits.length > 1) {
        const top = hits
          .slice(0, 5)
          .map(h => `${h.i + 1}. ${getNombre(lista[h.i])}`)
          .join("\n");
        msg.body(
          `Se encontraron varias coincidencias, elija número:\n` +
          `${top}${hits.length > 5 ? "\n…" : ""}`
        );
        // opcional: acotar la lista para la siguiente selección
        sesion._responsables = hits.map(h => h.item);
        return res.type("text/xml").send(twiml.toString());
      }

      msg.body("No encontré coincidencias. Escriba el *número* de la lista o intente otra parte del nombre.");
      return res.type("text/xml").send(twiml.toString());
    }

  // (3) Bultos de turba (≥ 0, entero)
  if (estado === "mezcla_turba") {
    if (!esEnteroNoNegativo(texto)) {
      msg.body("❗ Debe ser un *entero ≥ 0*. Intente de nuevo:");
      return res.type("text/xml").send(twiml.toString());
    }
    datos.turba_bultos = Number(texto);
    sesion.estado = "mezcla_cascarilla";
    msg.body("🌾 Cantidad de *bultos de cascarilla* (entero ≥ 0):");
    return res.type("text/xml").send(twiml.toString());
  }

  // (4) Bultos de cascarilla (≥ 0, entero)
  if (estado === "mezcla_cascarilla") {
    if (!esEnteroNoNegativo(texto)) {
      msg.body("❗ Debe ser un *entero ≥ 0*. Intente de nuevo:");
      return res.type("text/xml").send(twiml.toString());
    }
    datos.cascarilla_bultos = Number(texto);
    sesion.estado = "mezcla_progro";
    msg.body("🧪 Cantidad de *gramos de progro* (entero ≥ 0):");
    return res.type("text/xml").send(twiml.toString());
  }

  // (5) Gramos de progro (≥ 0, entero)
  if (estado === "mezcla_progro") {
    if (!esEnteroNoNegativo(texto)) {
      msg.body("❗ Debe ser un *entero ≥ 0*. Intente de nuevo:");
      return res.type("text/xml").send(twiml.toString());
    }
    datos.progro_gramos = Number(texto);
    sesion.estado = "mezcla_cant_lonas";
    msg.body("🧵 Ingrese *cantidad de lonas* (entero ≥ 0):");
    return res.type("text/xml").send(twiml.toString());
  }

  // (6) Cantidad de lonas (≥ 0, entero)
  if (estado === "mezcla_cant_lonas") {
    if (!esEnteroNoNegativo(texto)) {
      msg.body("❗ Debe ser un *entero ≥ 0*. Intente de nuevo:");
      return res.type("text/xml").send(twiml.toString());
    }
    datos.cant_lonas = Number(texto);

    sesion.estado = "mezcla_bandejas128";
    msg.body("🧩 Cantidad de *bandejas 128* (entero ≥ 0):");
    return res.type("text/xml").send(twiml.toString());
  }

  // (7) Bandejas 128 (≥ 0, entero)
  if (estado === "mezcla_bandejas128") {
    if (!esEnteroNoNegativo(texto)) {
      msg.body("❗ Debe ser un *entero ≥ 0*. Intente de nuevo:");
      return res.type("text/xml").send(twiml.toString());
    }
    datos.bandejas128 = Number(texto);
    sesion.estado = "mezcla_bandejas200";
    msg.body("🧩 Cantidad de *bandejas 200* (entero ≥ 0):");
    return res.type("text/xml").send(twiml.toString());
  }

  // (8) Bandejas 200 (≥ 0, entero) → finalizar
  if (estado === "mezcla_bandejas200") {
    if (!esEnteroNoNegativo(texto)) {
      msg.body("❗ Debe ser un *entero ≥ 0*. Intente de nuevo:");
      return res.type("text/xml").send(twiml.toString());
    }
    datos.bandejas200 = Number(texto);

    // LISTO: enviar a tu BD
    datos.proceso = "mezcla";
    datos.user = from;
    enviarAGoogleSheet(datos).then((exito) => {
      if (exito) {
        const totalBandejas = (Number(datos.bandejas128 || 0) + Number(datos.bandejas200 || 0)) || 0;

        const resumen = [
          `📅 Fecha: ${datos.fecha || hoyDDMMYYYY()}`,
          `👤 Responsable: ${datos.responsable_nombre || datos.responsable_key || "—"}`,
          `🪵 Turba (bultos): ${Number(datos.turba_bultos || 0)}`,
          `🌾 Cascarilla (bultos): ${Number(datos.cascarilla_bultos || 0)}`,
          `🧪 Progro (g): ${Number(datos.progro_gramos || 0)} g`,
          `🧵 Lonas: ${Number(datos.cant_lonas || 0)}`,
          `🧩 Bandejas 128: ${Number(datos.bandejas128 || 0)}`,
          `🧩 Bandejas 200: ${Number(datos.bandejas200 || 0)}`,
          `📦 Total bandejas: ${totalBandejas}`
        ].join("\n");

        msg.body(`✅ Registro de *Mezcla* exitoso.\n\n${resumen}\n\nEscribe "inicio" para registrar otro proceso.`);
      } else {
        msg.body("⚠️ Registro completado, pero hubo un error al guardar en Google Sheets.");
      }
      delete sesiones[from];
      res.type("text/xml").send(twiml.toString());
    });

    return; // evitar continuar el flujo
  }
}

// ====== FLUJO: SIEMBRA ======
if (sesion?.proceso === "siembra") {
  const datos = (sesion.datos ||= {});
  const estado = sesion.estado;

  // (1) Confirmar / cambiar fecha
  if (estado === "siembra_confirmar_fecha") {
    const choice = getChoiceFromRequest(req, texto); // 'confirmar_fecha' | 'cambiar_fecha' | '1' | '2'
    const hoy = hoyDDMMYYYY();
    if (choice === "confirmar_fecha" || choice === "1" || choice === "confirmar (hoy)") {
      datos.fecha = hoy;
      sesion.estado = "siembra_variedad";
      // Cargar variedades
      const lista = await getVariedades();
      if (!lista.length) {
        msg.body("⚠️ No hay *variedades* disponibles (con stock y en Producción). Escriba *inicio* para reiniciar.");
        return res.type("text/xml").send(twiml.toString());
      }
      sesion._variedades = lista;
      msg.body(
        `🧬 *Variedad*\nElija por número o escriba parte del nombre:\n\n` +
        renderLista(lista, it => it.nombre, 10)
      );
      return res.type("text/xml").send(twiml.toString());
    }

    if (choice === "cambiar_fecha" || choice === "2" || choice === "cambiar fecha") {
      sesion.estado = "siembra_fecha_manual";
      msg.body("📅 Escriba la *fecha del reporte* (dd/mm/aaaa):");
      return res.type("text/xml").send(twiml.toString());
    }

    await enviarConfirmarFecha({ to: from, fecha: hoy, msg, res, twiml });
    return;
  }

  // (1b) Fecha manual
  if (estado === "siembra_fecha_manual") {
    if (!esFechaValida(texto)) {
      msg.body("❗ Formato inválido. Use *dd/mm/aaaa*.");
      return res.type("text/xml").send(twiml.toString());
    }
    datos.fecha = texto;
    sesion.estado = "siembra_variedad";
    const lista = await getVariedades();
    if (!lista.length) {
      msg.body("⚠️ No hay *variedades* disponibles (con stock y en Producción). Escriba *inicio* para reiniciar.");
      return res.type("text/xml").send(twiml.toString());
    }
    sesion._variedades = lista;
    msg.body(
      `🧬 *Variedad*\nElija por número o escriba parte del nombre:\n\n` +
      renderLista(lista, it => it.nombre, 10)
    );
    return res.type("text/xml").send(twiml.toString());
  }

  // (2) Variedad: número o texto
  if (estado === "siembra_variedad") {
    let lista = sesion._variedades || [];
    if (!lista.length) {
      msg.body("⚠️ Sin lista de variedades. Escriba *inicio* para reiniciar.");
      return res.type("text/xml").send(twiml.toString());
    }

    // Selección por número
    if (/^\d+$/.test(texto)) {
      const idx = Number(texto) - 1;
      if (idx >= 0 && idx < lista.length) {
        const sel = lista[idx];
        // ✅ Guardar variedad
        datos.variedad_id = sel.id;
        datos.variedad_nombre = sel.nombre;

        // ✅ NUEVO: cargar facturas relacionadas a esa variedad
        const facturas = await getFacturasPorVariedad(sel.id); // <-- backend nuevo
        if (!facturas.length) {
          msg.body("⚠️ Esta variedad no tiene *facturas* disponibles. Elija otra variedad o escriba *inicio*.");
          return res.type("text/xml").send(twiml.toString());
        }
        sesion._facturas = facturas;
        sesion.estado = "siembra_factura";

        msg.body(
          `🧾 *Factura* para *${sel.nombre}*\nElija por número:\n\n` +
          renderLista(facturas, it => `${it.label || it.numero || it.id}`, 10)
        );
        return res.type("text/xml").send(twiml.toString());

      }
      msg.body(`Número fuera de rango (1-${lista.length}). Intente de nuevo.`);
      return res.type("text/xml").send(twiml.toString());
    }

    // Búsqueda por texto
    const q = norm(texto);
    const hits = lista.filter(v => norm(v.nombre).includes(q));
    if (hits.length === 1) {
      const sel = hits[0];
      datos.variedad_id = sel.id;
      datos.variedad_nombre = sel.nombre;

      const facturas = await getFacturasPorVariedad(sel.id);
      if (!facturas.length) {
          msg.body("⚠️ Esta variedad no tiene *facturas* disponibles. Elija otra variedad o escriba *inicio*.");
          return res.type("text/xml").send(twiml.toString());
        }
        sesion._facturas = facturas;
        sesion.estado = "siembra_factura";

        msg.body(
          `🧾 *Factura* para *${sel.nombre}*\nElija por número:\n\n` +
          renderLista(facturas, it => `${it.label || it.numero || it.id}`, 10)
        );
        return res.type("text/xml").send(twiml.toString());
    }

    if (hits.length > 1) {
      sesion._variedades = hits;
      msg.body(
        `Se encontraron varias coincidencias, elija número:\n` +
        renderLista(hits, it => it.nombre, 10)
      );
      return res.type("text/xml").send(twiml.toString());
    }

    msg.body("No encontré coincidencias. Responda con *número* o parte del nombre de la variedad.");
    return res.type("text/xml").send(twiml.toString());
  }

  // (3) Factura
  if (estado === "siembra_factura") {
    const lista = sesion._facturas || [];
    if (!lista.length) {
      msg.body("⚠️ Sin lista de facturas. Escriba *inicio* para reiniciar.");
      return res.type("text/xml").send(twiml.toString());
    }
    if (!/^\d+$/.test(texto)) {
      msg.body(`Responda con un número (1-${lista.length}).`);
      return res.type("text/xml").send(twiml.toString());
    }
    const idx = Number(texto) - 1;
    if (idx < 0 || idx >= lista.length) {
      msg.body(`Número fuera de rango (1-${lista.length}).`);
      return res.type("text/xml").send(twiml.toString());
    }

    const sel = lista[idx];
    datos.factura_id = sel.id;
    datos.factura_label = sel.label || sel.numero || sel.id;

    // ✅ NUEVO: cargar paquetes por (variedad + factura)
    const paquetes = await getPaquetesPorFacturaYVariedad({
      variedad_id: datos.variedad_id,
      factura_id: datos.factura_id
    }); // <-- backend nuevo

    if (!paquetes.length) {
      msg.body("⚠️ Esta factura no tiene *paquetes* disponibles para esa variedad. Elija otra factura o escriba *inicio*.");
      return res.type("text/xml").send(twiml.toString());
    }

    sesion._paquetes = paquetes;
    sesion.estado = "siembra_empaque";

    msg.body(
      `📦 *Códigos de empaque* para *${datos.variedad_nombre}* (Factura: *${datos.factura_label}*)\n` +
      `Responda con números separados por coma o rangos:\n` +
      `Ej: *1,3,5-10*\n\n` +
      renderLista(paquetes, it => `${it.codigo} (stock: ${it.stock_disponible})`, 10)
    );
    return res.type("text/xml").send(twiml.toString());
  }

  // (4) Empaque
  if (estado === "siembra_empaque") {
    const lista = sesion._paquetes || [];
    if (!lista.length) {
      msg.body("⚠️ No hay paquetes para esta factura/variedad. Escriba *inicio* para reiniciar.");
      return res.type("text/xml").send(twiml.toString());
    }

    const parsed = parseRangosIndices(texto, lista.length);
    if (!parsed.ok) {
      msg.body(`❗ ${parsed.error}\nUse ejemplo: *1,3,5-10* (1-${lista.length}).`);
      return res.type("text/xml").send(twiml.toString());
    }

    const idxs = parsed.indices.map(n => n - 1);
    const seleccion = idxs.map(i => lista[i]);

    // ✅ guardar lista de paquetes
    datos.empaque_id = seleccion.map(x => x.id);
    datos.empaque_codigo = seleccion.map(x => x.codigo);
    datos.empaque_stock_total = seleccion.reduce((a,x)=>a + Number(x.stock_disponible || 0), 0);

    // ✅ cargar bandejas igual que antes
    const bandejas = await getBandejas();
    if (!bandejas.length) {
      msg.body("⚠️ No hay tipos de bandeja configurados. Contacte a sistemas.");
      return res.type("text/xml").send(twiml.toString());
    }

    const fil = bandejas.filter(b => /128/.test(b.nombre) || /200/.test(b.nombre));
    sesion._bandejas = fil.length ? fil : bandejas;

    sesion.estado = "siembra_bandeja";
    msg.body(
      `🧩 *Tipo de bandeja*\nElija por número:\n\n` +
      renderLista(sesion._bandejas, it => `${it.nombre} (${it.cantidad} cavidades)`, 10)
    );
    return res.type("text/xml").send(twiml.toString());
  }

  // (5) Tipo bandeja
  if (estado === "siembra_bandeja") {
    const lista = sesion._bandejas || [];
    if (!lista.length) {
      msg.body("⚠️ Sin lista de bandejas. Escriba *inicio*.");
      return res.type("text/xml").send(twiml.toString());
    }
    if (!/^\d+$/.test(texto)) {
      msg.body(`Responda con un número (1-${lista.length}).`);
      return res.type("text/xml").send(twiml.toString());
    }
    const idx = Number(texto) - 1;
    if (idx < 0 || idx >= lista.length) {
      msg.body(`Número fuera de rango (1-${lista.length}).`);
      return res.type("text/xml").send(twiml.toString());
    }

    const sel = lista[idx];
    datos.bandeja_id = sel.id;
    datos.bandeja_nombre = sel.nombre;     // "128 Alveolos"
    datos.bandeja_cavidades = Number(sel.cantidad || 0); // p.ej. 128

    // consulta capacidad (mezcla y stock) antes de pedir la cantidad
    const cap = await getCapacidad({
      cavidades: datos.bandeja_cavidades,
      variedad_id: datos.variedad_id,
      factura_id: datos.factura_id,
      empaque_ids: datos.empaque_ids,
      stock_total: datos.empaque_stock_total
    });

    if (!cap.ok) {
      msg.body(`⚠️ No se pudo calcular capacidad: ${cap.error || 'desconocido'}. Intente de nuevo más tarde.`);
      return res.type("text/xml").send(twiml.toString());
    }
    // guarda los topes en sesión para revalidar en el siguiente paso
    datos.tope_por_mezcla = cap.tope_por_mezcla;
    datos.tope_por_stock  = cap.tope_por_stock;
    datos.max_permitido   = cap.max_permitido;

    sesion.estado = "siembra_cantidad_bandejas";
    msg.body(
      `📦 *Cantidad de bandejas sembradas* (entero > 0)\n` +
      `Máximo permitido: *${datos.max_permitido}*\n` +
      `• Tope por mezcla: ${datos.tope_por_mezcla}\n` +
      `• Tope por stock:  ${datos.tope_por_stock}\n\n` +
      `Ingrese cantidad:`
    );
    return res.type("text/xml").send(twiml.toString());
  }

  // (6) Cantidad de bandejas (validación contra mezcla y stock)
  if (estado === "siembra_cantidad_bandejas") {
    if (!esEnteroNoNegativo(texto) || Number(texto) <= 0) {
      msg.body("❗ Debe ser un *entero > 0*. Intente de nuevo:");
      return res.type("text/xml").send(twiml.toString());
    }
    const cant = Number(texto);
    const maxPermitido = Number(datos.max_permitido || 0);

    if (maxPermitido <= 0) {
      msg.body(`⚠️ No hay capacidad disponible (mezcla/stock). Escriba *inicio* para reiniciar.`);
      return res.type("text/xml").send(twiml.toString());
    }
    if (cant > maxPermitido) {
      msg.body(
        `❗ La cantidad excede el máximo permitido (*${maxPermitido}*):\n` +
        `• Tope por mezcla: ${datos.tope_por_mezcla}\n` +
        `• Tope por stock:  ${datos.tope_por_stock}\n\n` +
        `Ingrese un valor ≤ ${maxPermitido}:`
      );
      return res.type("text/xml").send(twiml.toString());
    }

    datos.cantidad_bandejas_sembradas = cant;

    // Cálculos: 
    const cav = Number(datos.bandeja_cavidades || 1);
    const stock = Number(datos.empaque_stock_total || 0);

    datos.total_cavidades = cav * cant;
    const redondeoDiez = Math.floor(datos.total_cavidades / 10) * 10;
    datos.total_semillas = Math.min(stock, redondeoDiez);

    sesion.estado = "siembra_inconsistencia";
    msg.body(`📝 *Inconsistencia* (opcional). Si no aplica, escriba "-"`);
    return res.type("text/xml").send(twiml.toString());
  }


  // (7) Inconsistencia (opcional)
  if (estado === "siembra_inconsistencia") {
    datos.inconsistencia = (texto === "-") ? "" : texto;
    sesion.estado = "siembra_observaciones";
    msg.body("🌱 *Observaciones* (opcional). Si no aplica, escriba '-'");
    return res.type("text/xml").send(twiml.toString());
  }

  // (8) Germinación (opcional) → finalizar
  if (estado === "siembra_observaciones") {
    datos.observaciones = (texto === "-") ? "" : texto;

    // Empaquetar y enviar
    datos.proceso = "siembra";
    datos.user = from;

    // Sugerencia: además de IDs, mandamos labels útiles para tu hoja
    const payload = {
      proceso: datos.proceso,
      user: datos.user,
      fecha: datos.fecha,

      variedad_id: datos.variedad_id,
      variedad_nombre: datos.variedad_nombre,

      factura_id: datos.factura_id,
      factura_label: datos.factura_label,

      empaque_id: datos.empaque_id,
      empaque_codigo: datos.empaque_codigo,
      empaque_stock_total: datos.empaque_stock_total,

      bandeja_id: datos.bandeja_id,
      bandeja_nombre: datos.bandeja_nombre,
      bandeja_cavidades: datos.bandeja_cavidades,

      cantidad_bandejas_sembradas: datos.cantidad_bandejas_sembradas,
      total_cavidades: datos.total_cavidades,
      total_semillas: datos.total_semillas,

      inconsistencia: datos.inconsistencia || "",
      observaciones: datos.observaciones || ""
    };

    enviarAGoogleSheet(payload).then((exito) => {
      if (exito) {
        const resumen = [
          `📅 Fecha: ${payload.fecha}`,
          `🧬 Variedad: ${payload.variedad_nombre}`,
          `📦 Paquetes: ${payload.empaque_codigo.length} (stock total: ${payload.empaque_stock_total})`,
          `🧩 Bandeja: ${payload.bandeja_nombre} (${payload.bandeja_cavidades} cavidades)`,
          `🔢 Bandejas sembradas: ${payload.cantidad_bandejas_sembradas}`,
          `🧮 Total cavidades: ${payload.total_cavidades}`,
          `🌾 Total semillas: ${payload.total_semillas}`,
          payload.inconsistencia ? `⚠️ Inconsistencia: ${payload.inconsistencia}` : ``,
          payload.observaciones ? `🌱 Observaciones: ${payload.observaciones}` : ``
        ].filter(Boolean).join("\n");

        msg.body(`✅ Registro de *Siembra* exitoso.\n\n${resumen}\n\nEscribe "inicio" para registrar otro proceso.`);
      } else {
        msg.body("⚠️ Registro completado, pero hubo un error al guardar en Google Sheets.");
      }
      delete sesiones[from];
      res.type("text/xml").send(twiml.toString());
    });
    return;
  }
}

  msg.body('🤖 Escribe "inicio" para comenzar.');
  return res.type("text/xml").send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Bot activo en puerto ${PORT}`));
