export class ReviewCancelledError extends Error {
  constructor() {
    super("Review cancelled.");
    this.name = "ReviewCancelledError";
  }
}

export function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ReviewCancelledError();
  }
}

export function isReviewCancelledError(error: unknown): boolean {
  return error instanceof ReviewCancelledError || (error instanceof Error && error.name === "ReviewCancelledError");
}
