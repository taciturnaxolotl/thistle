import { Polar } from "@polar-sh/sdk";

const isDevelopment = process.env.NODE_ENV !== "production";

export const polar = new Polar({
	accessToken: process.env.POLAR_ACCESS_TOKEN ?? "",
	server: isDevelopment ? "sandbox" : "production",
});
