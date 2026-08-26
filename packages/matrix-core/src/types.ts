/** Vetor 2D imutavel. */
export type Vec2 = readonly [number, number];

/** Vetor 3D imutavel. */
export type Vec3 = readonly [number, number, number];

/**
 * Matriz homogenea 3x3 armazenada em row-major.
 *
 * Os vetores sao colunas: o indice `row * 3 + column` representa m[row][column].
 */
export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number
];

/** Matriz homogenea 4x4 armazenada em row-major, para vetores-coluna. */
export type Mat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

/** Os eixos sao aplicados da esquerda para a direita ao vetor-coluna. */
export type RotationOrder3D = "XYZ" | "XZY" | "YXZ" | "YZX" | "ZXY" | "ZYX";

export interface NumericTolerance {
  readonly absolute: number;
  readonly relative: number;
}

/** Scale e unitless (1 = 100%); todos os angulos sao radianos. */
export interface Transform2D {
  readonly position: Vec2;
  readonly anchor: Vec2;
  readonly scale: Vec2;
  readonly rotationRadians: number;
}

/** Scale e unitless (1 = 100%); todos os angulos sao radianos. */
export interface Transform3D {
  readonly position: Vec3;
  readonly anchor: Vec3;
  readonly scale: Vec3;
  readonly rotationRadians: Vec3;
  readonly rotationOrder: RotationOrder3D;
}

export interface AnchorCompensationOptions2D {
  /** Matrices em ordem da raiz ate o parent imediato. */
  readonly parentsRootToImmediate?: readonly Mat3[];
  readonly tolerance?: NumericTolerance;
}

export interface AnchorCompensationOptions3D {
  /** Matrices em ordem da raiz ate o parent imediato. */
  readonly parentsRootToImmediate?: readonly Mat4[];
  readonly tolerance?: NumericTolerance;
}

export interface AnchorCompensation2D {
  readonly transform: Readonly<Transform2D>;
  readonly beforeWorldMatrix: Mat3;
  readonly afterWorldMatrix: Mat3;
}

export interface AnchorCompensation3D {
  readonly transform: Readonly<Transform3D>;
  readonly beforeWorldMatrix: Mat4;
  readonly afterWorldMatrix: Mat4;
}
