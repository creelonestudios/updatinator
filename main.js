import { mkdir, stat, writeFile, readFile, copyFile, readdir } from "fs/promises";
import { join, parse } from "path";
import { createHash } from "crypto";

const config = JSON.parse(await readFile("bootstrap/config.json"));
let currentServerConfig;

async function download(url, file) {
	console.log(`Downloading ${url} into ${file}`);
	await writeFile(join(currentServerConfig.server_dir, file), Buffer.from(await fetch(url).then(res => res.arrayBuffer())));
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

class HangarAPI {
	static async getLatestVersion(author, slug, channel) {
		return (await fetch(`https://hangar.papermc.io/api/v1/projects/${author}/${slug}/latest?channel=${channel}`).then(res => res.text()));
	}
	static async downloadVersion(author, slug, version, platform, path) {
		await download(`https://hangar.papermc.io/api/v1/projects/${author}/${slug}/versions/${version}/${platform}/download`, path);
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
	if(!await exists(currentServerConfig.server_dir)) await mkdir(currentServerConfig.server_dir);
	if(!await exists(join(currentServerConfig.server_dir, "plugins"))) await mkdir(join(currentServerConfig.server_dir, "plugins"));
}

async function acceptEULA() {
	await writeFile(join(currentServerConfig.server_dir, "eula.txt"), "eula=true");
}

async function downloadSpigetResource(id, file) {
	await download(`https://api.spiget.org/v2/resources/${id}/download`, file);
}

async function updatePaper(project) {
	const builds = await PaperAPI.getBuildsForVersion(project, currentServerConfig.mc_version);
	const latestBuild = builds.builds[builds.builds.length - 1];
	const buildInfo = await PaperAPI.getBuildInfo(project, currentServerConfig.mc_version, latestBuild);
	if(await exists(join(currentServerConfig.server_dir, `${project}.jar`)) && await sha256(join(currentServerConfig.server_dir, `${project}.jar`)) == buildInfo.downloads.application.sha256) return;
	await PaperAPI.downloadBuild(project, currentServerConfig.mc_version, latestBuild, buildInfo.downloads.application.name, `${project}.jar`);
}

async function copyConfigs() {
	const dir = join("bootstrap", currentServerConfig.configs);
	const files = await readdir(dir);
	for(const file of files) {
		const f = parse(file);
		await mkdir(join(currentServerConfig.server_dir, f.dir), { recursive: true });
		await copyFile(join(dir, file), join(currentServerConfig.server_dir, file));
	}
}

for(const server of config) {
	currentServerConfig = server;
	await createBasicServerStructure();
	await acceptEULA();
	await updatePaper(currentServerConfig.type);
	await copyConfigs();
	for(const resource of currentServerConfig.spiget_resources) await downloadSpigetResource(resource, join("plugins", resource + ".jar"));
	for(const project of currentServerConfig.hangar_projects) {
		const latestVersion = await HangarAPI.getLatestVersion(project.author, project.slug, project.channel);
		await HangarAPI.downloadVersion(project.author, project.slug, latestVersion, currentServerConfig.type.toUpperCase(), join("plugins", project.slug + ".jar"));
	}
}
