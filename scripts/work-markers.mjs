/** Marcador isolado de trabalho inacabado, não fragmento de palavra/identificador. */
export function findWorkMarker(source) {
  // Unicode evita também o falso positivo de TODO dentro de MÉTODO.
  return source.match(/(?:^|[^\p{L}\p{N}_])(TODO|FIXME|XXX)(?![\p{L}\p{N}_])/u)?.[1] ?? null;
}
