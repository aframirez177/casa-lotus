// Display titles in narrow columns: the longest word decides how big the title can be, so a long word
// («conocernos.», «multinivel.») never runs out of its column. Use as style={palabra(titulo)}.
export const palabra = (texto: string) => `--palabra: ${Math.max(...texto.split(/\s+/).map((w) => w.length), 1)}`;
