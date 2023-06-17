import { mkdir, stat, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";

const config = JSON.parse(await readFile("bootstrap/config.json"));

async function download(url, file) {
	console.log(`Downloading ${url} into ${file}`);
	await writeFile(join(config.server_dir, file), Buffer.from(await fetch(url).then(res => res.arrayBuffer())));
}

async function sha256(path) {
	const buff = await readFile(path);
	const hash = createHash("sha256").update(buff).digest("hex");
	return hash;
}

class PaperAPI {
	static async getProjects() {
		return (await fetch("https://api.papermc.io/v2/projects").then(res => res.json()));
	}
	static async getProject(project) {
		return (await fetch(`https://api.papermc.io/v2/projects/${project}`).then(res => res.json()));
	}
	static async getBuildsForVersion(project, version) {
		return (await fetch(`https://api.papermc.io/v2/projects/${project}/versions/${version}`).then(res => res.json()));
	}
	static async getBuildInfo(project, version, build) {
		return (await fetch(`https://api.papermc.io/v2/projects/${project}/versions/${version}/builds/${build}`).then(res => res.json()));
	}
	static async downloadBuild(project, version, build, file, path) {
		await download(`https://papermc.io/api/v2/projects/${project}/versions/${version}/builds/${build}/downloads/${file}`, path);
	}
}

async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function createBasicServerStructure() {
	if(!await exists(config.server_dir)) await mkdir(config.server_dir);
	if(!await exists(join(config.server_dir, "plugins"))) await mkdir(join(config.server_dir, "plugins"));
}

async function acceptEULA() {
	await writeFile(join(config.server_dir, "eula.txt"), "eula=true");
}

async function downloadSpigetResource(id, file) {
	await download(`https://api.spiget.org/v2/resources/${id}/download`, file);
}

async function updatePaper() {
	const builds = await PaperAPI.getBuildsForVersion("paper", config.mc_version);
	const latestBuild = builds.builds[builds.builds.length - 1];
	const buildInfo = await PaperAPI.getBuildInfo("paper", config.mc_version, latestBuild);
	if(await exists(join(config.server_dir, "paper.jar")) && await sha256(join(config.server_dir, "paper.jar")) == buildInfo.downloads.application.sha256) return;
	await PaperAPI.downloadBuild("paper", config.mc_version, latestBuild, buildInfo.downloads.application.name, "paper.jar");
}

async function copyServerProperties() {
	if(await exists("bootstrap/server.properties")) await writeFile(join(config.server_dir, "server.properties"), await readFile("bootstrap/server.properties"));
}

await createBasicServerStructure();
await acceptEULA();
await updatePaper();
await copyServerProperties();
for(const resource of config.spiget_resources) await downloadSpigetResource(resource, join("plugins", resource + ".jar"));
