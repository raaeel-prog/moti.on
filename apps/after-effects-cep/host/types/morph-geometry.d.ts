type MorphPoint = [number, number];
type MorphCubic = [MorphPoint, MorphPoint, MorphPoint, MorphPoint];
interface MorphPath {
  vertices: MorphPoint[]; inTangents: MorphPoint[]; outTangents: MorphPoint[]; closed: boolean;
}
interface MorphCell {
  x:number; y:number; width:number; height:number; first:boolean; last:boolean; maxRadius?:number;
}
interface PreparedMorphContour {
  target:MorphPath; sourceMap:Array<[number,number,number]>; extra:boolean; collapse:MorphPoint; depth:number;
}
/** Prepared cubic path data shared by the native morph builder and expressions. */
declare const MotionMorphGeometry: {
  normalize(path: unknown): MorphPath;
  bounds(path: unknown): {left:number; top:number; right:number; bottom:number; width:number; height:number};
  area(path: unknown): number;
  transform(path: unknown, matrix: number[]): MorphPath;
  splitCubic(curve: MorphCubic, t: number): {left:MorphCubic; right:MorphCubic};
  subCurve(curve:MorphCubic, lo:number, hi:number): MorphCubic;
  curves(path:unknown): MorphCubic[];
  prepareGlyph(contours:unknown[], cell:MorphCell, options?:{roundness?:number}): PreparedMorphContour[];
  source(data:PreparedMorphContour, cell:MorphCell, roundness:number): MorphPath;
  sourceExpression(data:PreparedMorphContour, cellExpression:string, roundnessExpression:string): string;
  ease(progress:number, smoothness:number): number;
};
