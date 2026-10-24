import type { Registry } from "./index.js";

/** A field of a form, as the forms kit's adapter describes it. The adapter may add keys of its own; the kit hands the object back. */
export interface FormField {
  /** A dotted path, such as title, body.summary or links.0.uri. */
  field: string;
  label?: string;
  /** string, text, html, number, boolean, choice, choices, a type of the adapter's own, or unsupported (listed, never filled). */
  type: string;
  /** Picks the adapter's type by another key than type, for a type filled more than one way. */
  handler?: string;
  required?: boolean;
  /** For choice and choices: the keys and their labels. */
  options?: Record<string, string>;
  /** How form set takes the value, shown by form fields and form get. */
  format?: string;
  /** What the field held when the form loaded: unsaved changes are measured from it. */
  value: unknown;
  [key: string]: unknown;
}

/** A form on the page. The adapter may add keys of its own; the kit hands the object back. */
export interface FormInfo {
  /** Command-safe, such as contact or node-article-edit-form. */
  id: string;
  /** What the form edits, for messages: Contact, article "Hello". */
  label?: string;
  /** What the form edits, as the app describes it; form status shows it. */
  entity?: Record<string, unknown>;
  fields: FormField[];
  /** Errors the app found, such as after a failed submit. field is "" for the whole form. */
  errors?: Array<{ field?: string; message: string }>;
  [key: string]: unknown;
}

/** What every adapter function gets last. */
export interface FormCallOptions {
  signal?: AbortSignal;
  /** The command, for messages: "form set". */
  verb: string;
}

/** A value type of the app's own. */
export interface FormType<F extends FormInfo = FormInfo> {
  /** Turns the text form set got into the value write() takes, or throws a CommandError that says what the field takes. */
  coerce?(field: FormField, raw: string, form: F, options: FormCallOptions): unknown;
  /** Values to complete in form set. */
  suggest?(field: FormField, partial: string, form: F, options: { signal?: AbortSignal }): Array<string | { value: string; description?: string }> | Promise<Array<string | { value: string; description?: string }>>;
  /** How form set takes the value, when the field gives none. */
  format?: string;
}

/** What an optional command's adapter function answers: data for the result and, if the kit's text will not do, a text of its own. */
export interface FormAnswer<D> {
  data: D;
  text?: string;
}

/** What the app supplies to the forms kit. */
export interface FormsAdapter<F extends FormInfo = FormInfo> {
  /** The forms on the page now. Called each time a command runs. Answer at once (no promise) for the person's questions to name what changes. */
  forms(): F[] | Promise<F[]>;
  /** A field's value now. */
  read(form: F, field: FormField): unknown;
  /** Fills a field with a converted value. */
  write(form: F, field: FormField, value: unknown, options: FormCallOptions): void | Promise<void>;
  /** Sends the form. With reloads, called after form submit has answered; without, awaited for its text and data. */
  submit(form: F, options: FormCallOptions): void | { text?: string; data?: Record<string, unknown> } | Promise<void | { text?: string; data?: Record<string, unknown> }>;
  /** true if submitting loads a new page (form submit is marked navigates); false if the app answers in place. */
  reloads: boolean;
  /** Value types of the app's own, by type or handler. They come before the basic types. */
  types?: Record<string, FormType<F>>;
  /** Problems the app finds before sending, such as the browser's validation. */
  check?(form: F, options: FormCallOptions): Array<{ field?: string; message: string }> | Promise<Array<{ field?: string; message: string }>>;
  /** A sentence added to the person's question, such as "It will be published." */
  notes?: { submit?(form: F): string; upload?(form: F, input: Record<string, unknown>): string };
  /** More for form set's value description: how this app's types take values. */
  valueHelp?: string;
  /** form add: an empty item (value undefined) or a value added to what the field holds. */
  add?(form: F, field: string, value: string | undefined, options: FormCallOptions): FormAnswer<{ added: unknown[]; item?: string; [key: string]: unknown }> | Promise<FormAnswer<{ added: unknown[]; item?: string; [key: string]: unknown }>>;
  addable?(form: F): Array<{ field: string; label?: string }> | Promise<Array<{ field: string; label?: string }>>;
  /** form remove: an item or a file, by its path. */
  remove?(form: F, target: string, options: FormCallOptions): FormAnswer<{ removed: string; items?: number; [key: string]: unknown }> | Promise<FormAnswer<{ removed: string; items?: number; [key: string]: unknown }>>;
  removable?(form: F): Array<{ target: string; label?: string }> | Promise<Array<{ target: string; label?: string }>>;
  /** form search: what a reference field can point to. */
  search?(form: F, field: string, text: string, options: FormCallOptions): FormAnswer<{ field?: string; candidates: Array<{ value: string; label: string; id?: string }> }> | Promise<FormAnswer<{ field?: string; candidates: Array<{ value: string; label: string; id?: string }> }>>;
  searchable?(form: F): Array<{ field: string; label?: string }> | Promise<Array<{ field: string; label?: string }>>;
  /** form upload: Files from a URL or content, or null to let the person choose one. */
  upload?(form: F, field: string, files: File[] | null, input: Record<string, unknown>, options: FormCallOptions & { caller?: unknown }): FormAnswer<{ uploaded: Array<{ field: string; filename: string; [key: string]: unknown }>; refused?: string[] }> | Promise<FormAnswer<{ uploaded: Array<{ field: string; filename: string; [key: string]: unknown }>; refused?: string[] }>>;
  uploadable?(form: F): Array<{ field: string; label?: string }> | Promise<Array<{ field: string; label?: string }>>;
}

/** Registers form list, status, fields, get, set, submit and discard, and form add, remove, search and upload where the adapter supplies them. Returns a function that removes them. */
export declare function forms<F extends FormInfo = FormInfo>(adapter: FormsAdapter<F>, options?: { registry?: Registry }): () => void;
