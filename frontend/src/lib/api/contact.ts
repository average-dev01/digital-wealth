// Public contact form. Stored server-side for the desk to read  no email is
// sent, since there's no mail provider in this build.

import { fetchApi } from "./client";

export type ContactPayload = {
  name: string;
  email: string;
  message: string;
};

export async function submitContact(payload: ContactPayload): Promise<void> {
  await fetchApi<{ ok: true }>("/contact", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
