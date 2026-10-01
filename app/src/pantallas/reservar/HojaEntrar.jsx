// «¿Ya has venido? Entra con tu WhatsApp» inside the booking flow. Loaded on demand.
import { Hoja } from "../../ui/Hoja.jsx";
import { FlujoCodigo } from "../entrar/FlujoCodigo.jsx";

export default function HojaEntrar({ abierta, whatsapp, cerrar, alEntrar }) {
  return (
    <Hoja abierta={abierta} alCerrar={cerrar} titulo="Entra con tu WhatsApp" descripcion="Te enviamos un código y seguimos con tu reserva.">
      <FlujoCodigo compacto whatsappInicial={whatsapp} onListo={alEntrar} />
    </Hoja>
  );
}
