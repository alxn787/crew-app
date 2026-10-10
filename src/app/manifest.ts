import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FDTL Check",
    short_name: "FDTL",
    description: "Check a cabin crew roster against DGCA flight duty time limitations.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#0284c7",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
