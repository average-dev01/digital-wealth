// Identity verification submission.
//
// SIMULATED upload: there is no file storage in this build, so only the
// selected file's name is sent and recorded as a stand-in `storage_path`.
// No bytes leave the browser.

import { fetchApi } from "./client";

export type KycPayload = {
  full_name: string;
  dob: string;
  country: string;
};

export async function submitKyc(
  _userId: string,
  payload: KycPayload,
  file: File | null,
): Promise<void> {
  await fetchApi<{ ok: true }>("/kyc", {
    method: "POST",
    body: JSON.stringify({
      fullName: payload.full_name,
      dob: payload.dob,
      country: payload.country,
      fileName: file?.name ?? null,
    }),
  });
}
