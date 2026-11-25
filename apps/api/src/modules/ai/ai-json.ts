/**
 * Extrae el objeto JSON de la salida del modelo. Aunque el prompt exige JSON
 * puro, los LLM suelen envolverlo en una cerca markdown (```json ... ```) o
 * anteponer/anadir texto. Se quita la cerca y, si aun hay texto alrededor, se
 * toma el tramo entre la primera "{" y la ultima "}". Si no hay llaves se
 * devuelve el texto tal cual (JSON.parse fallara y el caller responde 422).
 */
export function extractJsonObject(raw: string): string {
  const unfenced = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  return start !== -1 && end > start ? unfenced.slice(start, end + 1) : unfenced;
}