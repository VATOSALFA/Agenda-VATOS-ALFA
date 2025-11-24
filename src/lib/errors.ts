
export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  requestResourceData?: any;
  message?: string;
};

export class FirestorePermissionError extends Error {
  public context: SecurityRuleContext;

  constructor(context: SecurityRuleContext) {
    const defaultMessage = `FirestoreError: Missing or insufficient permissions.`;
    const finalMessage = context.message ? `${defaultMessage}\n${context.message}` : defaultMessage;
    super(finalMessage);
    this.name = 'FirestorePermissionError';
    this.context = context;

    // This is necessary for transitioning from a built-in Error to a custom one.
    Object.setPrototypeOf(this, FirestorePermissionError.prototype);
  }
}
