interface TextGlyphOutline {
  /** Original UTF-16 offset, including spaces and manual line breaks. */
  sourceIndex:number;
  /** One-based AE selector index: spaces count, CR/LF do not, surrogate pairs count once. */
  textIndex:number;
  character:string;
  contours:MorphPath[];
  bounds:{left:number; top:number; right:number; bottom:number; width:number; height:number};
  center:MorphPoint;
}
declare const MotionTextGlyphOutlines: {
  extract(comp:unknown, source:unknown, created?:unknown[]):{glyphs:TextGlyphOutline[]; vertexCount:number};
  bounds(contours:unknown[]):{left:number; top:number; right:number; bottom:number; width:number; height:number};
};
