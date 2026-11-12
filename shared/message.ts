// R-281: main-process messages with values in them. Messages are translated in the window by looking the whole
// sentence up, which a sentence with a path or a count in it never matches; so main sends the sentence with {0}, {1}…
// placeholders and the values beside it, and the window translates the sentence and then fills the values in.
// Each message is marked from start to end, so messages joined with other text (a list of failures after a
// summary) still come apart: START sentence SEPARATOR ["values"] END. JSON escapes control characters, so the
// markers never appear inside the values.
const START = '\u001e',
  SEPARATOR = '\u001f',
  END = '\u001d'
const segment = /\u001e([^\u001d\u001e\u001f]*)\u001f([^\u001d\u001e]*)\u001d/g
export function fmt(key: string, ...values: unknown[]) {
  return START + key + SEPARATOR + JSON.stringify(values.map((value) => String(value))) + END
}
export const hasMessage = (text: string) => text.includes(START)
// Replaces every marked message with what `render` makes of its sentence and values; other text stays as it is.
export function renderMessages(text: string, render: (key: string, values: string[]) => string) {
  return text.replace(segment, (whole, key: string, json: string) => {
    try {
      const values = JSON.parse(json)
      if (Array.isArray(values)) return render(key, values.map(String))
    } catch {}
    return whole
  })
}
// The message in Traditional Chinese with its values filled in: for logs, tests and code that matches on wording.
export function plainMessage(text: string): string {
  return renderMessages(text, (key, values) =>
    key.replace(/\{(\d+)\}/g, (placeholder, index) =>
      values[Number(index)] !== undefined ? plainMessage(values[Number(index)]) : placeholder
    )
  )
}
