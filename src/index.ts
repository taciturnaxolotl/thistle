import indexHTML from "./pages/index.html";

const server = Bun.serve({
	port: 3000,
	routes: {
		"/": indexHTML,
	},
	development: {
		hmr: true,
		console: true,
	},
});

console.log(`🪻 Thistle running at http://localhost:${server.port}`);
