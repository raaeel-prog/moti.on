import { fail } from "./errors.js";
import { DEFAULT_SINGULAR_EPSILON } from "./numeric.js";
import { requireFiniteResult } from "./validation.js";

function validateEpsilon(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    fail("INVALID_SINGULAR_EPSILON", "singularEpsilon precisa ser finito e maior que zero.");
  }
  return value;
}

/** Gauss-Jordan com pivotamento parcial e limiar explicito de singularidade. */
export function invertSquare(
  source: readonly number[],
  dimension: number,
  singularEpsilon: number = DEFAULT_SINGULAR_EPSILON
): readonly number[] {
  const epsilon = validateEpsilon(singularEpsilon);
  const width = dimension * 2;
  const augmented = Array.from({ length: dimension }, (_, row) => {
    const values = new Array<number>(width).fill(0);
    for (let column = 0; column < dimension; column += 1) {
      values[column] = source[row * dimension + column]!;
      values[dimension + column] = row === column ? 1 : 0;
    }
    return values;
  });

  for (let pivotColumn = 0; pivotColumn < dimension; pivotColumn += 1) {
    let pivotRow = pivotColumn;
    let pivotMagnitude = Math.abs(augmented[pivotRow]![pivotColumn]!);
    for (let candidate = pivotColumn + 1; candidate < dimension; candidate += 1) {
      const magnitude = Math.abs(augmented[candidate]![pivotColumn]!);
      if (magnitude > pivotMagnitude) {
        pivotMagnitude = magnitude;
        pivotRow = candidate;
      }
    }

    if (!Number.isFinite(pivotMagnitude)) {
      fail("NON_FINITE_RESULT", "A eliminacao da matrix produziu pivot nao finito.", {
        operation: "inverse"
      });
    }
    if (pivotMagnitude <= epsilon) {
      fail("SINGULAR_MATRIX", "A matrix e singular ou numericamente instavel no limiar informado.", {
        pivotColumn,
        singularEpsilon: epsilon
      });
    }

    if (pivotRow !== pivotColumn) {
      const temporary = augmented[pivotColumn]!;
      augmented[pivotColumn] = augmented[pivotRow]!;
      augmented[pivotRow] = temporary;
    }

    const pivot = augmented[pivotColumn]![pivotColumn]!;
    for (let column = 0; column < width; column += 1) {
      augmented[pivotColumn]![column] = requireFiniteResult(
        augmented[pivotColumn]![column]! / pivot,
        "inverse"
      );
    }

    for (let row = 0; row < dimension; row += 1) {
      if (row === pivotColumn) continue;
      const factor = augmented[row]![pivotColumn]!;
      for (let column = 0; column < width; column += 1) {
        augmented[row]![column] = requireFiniteResult(
          augmented[row]![column]! - factor * augmented[pivotColumn]![column]!,
          "inverse"
        );
      }
    }
  }

  const inverse = new Array<number>(dimension * dimension);
  for (let row = 0; row < dimension; row += 1) {
    for (let column = 0; column < dimension; column += 1) {
      inverse[row * dimension + column] = augmented[row]![dimension + column]!;
    }
  }
  return inverse;
}
