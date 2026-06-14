import client from "./client";

export interface LmProfile {
  key: string;
  name: string;
  model: string;
  base_url: string;
}

export interface ProfilesResponse {
  profiles: LmProfile[];
}

export async function fetchProfiles(): Promise<LmProfile[]> {
  const { data } = await client.get<ProfilesResponse>("/llm/profiles");
  return data.profiles;
}
