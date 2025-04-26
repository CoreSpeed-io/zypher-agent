// Shared in-memory storage for pending tool-approval resolutions
let pendingApprovalRequest: ((approved: boolean) => void) | null = null;
let _isWaiting = false;

/**
 * Called by the ZypherAgent when it needs API approval for a tool call
 */
export async function handleToolApproval(): Promise<boolean> {
  console.log("🔔 API tool approval requested—waiting for client approval");
  _isWaiting = true;
  try {
    return await new Promise<boolean>((resolve) => {
      pendingApprovalRequest = resolve;
    });
  } finally {
    _isWaiting = false; // Ensure flag is reset even if promise rejects unexpectedly
    pendingApprovalRequest = null; // Clear resolver
  }
}

/**
 * Called by the HTTP endpoint to approve or reject the pending tool call
 */
export function resolveToolApproval(approved: boolean): void {
  if (pendingApprovalRequest) {
    pendingApprovalRequest(approved);
    // _isWaiting and pendingApprovalRequest are reset in the finally block of handleToolApproval
  }
}

/**
 * Cancel any pending approval and reset the state
 * Call this when connections are closed unexpectedly
 * @returns true if there was a pending approval that was cancelled, false otherwise
 */
export function cancelPendingApproval(): boolean {
  const wasPending = _isWaiting;

  // If there's a pending approval, resolve it with false (reject)
  if (pendingApprovalRequest) {
    pendingApprovalRequest(false);
    pendingApprovalRequest = null;
  }

  // Reset the waiting flag
  _isWaiting = false;

  if (wasPending) {
    console.log("Cancelled pending tool approval due to connection issues");
  }

  return wasPending;
}

/**
 * Check if a tool approval is currently pending
 */
export function isWaitingForToolApproval(): boolean {
  return _isWaiting;
}

/**
 * Check if a tool approval is currently pending
 */
export function hasPendingToolApproval(): boolean {
  return pendingApprovalRequest !== null;
}
