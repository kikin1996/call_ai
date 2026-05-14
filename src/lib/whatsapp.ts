/**
 * CallMeBot WhatsApp API – odeslání zprávy brokerovi
 * Postup nastavení:
 *  1. Přidej +34 644 59 78 19 do kontaktů
 *  2. Pošli "I allow callmebot to send me messages" na toto číslo přes WhatsApp
 *  3. Dostaneš API klíč odpovědí
 */
export async function sendWhatsAppMessage(
  phone: string,
  apiKey: string,
  text: string
): Promise<void> {
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const body = await res.text();
  if (!res.ok || body.toLowerCase().includes("error")) {
    throw new Error(`CallMeBot: ${body.slice(0, 200)}`);
  }
}
