// Reads a PNG's width and height from its IHDR chunk (no dependency).
export const PNG = {
  medidas(buffer) {
    const b = Buffer.from(buffer);
    if (b.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
    return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
  },
};
