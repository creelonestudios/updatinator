import { mkdir, stat, writeFile, readFile, copyFile, readdir, cp } from "fs/promises";
import { join, parse } from "path";
import { createHash } from "crypto";

const config = JSON.parse(await readFile("bootstrap/config.json"));
let currentServerConfig;

async function download(url, file) {
	console.log(`Downloading ${url} into ${file}`);
	const res = await fetch(url);
	if(res.status != 200) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
	const buf = Buffer.from(await res.arrayBuffer());
	await writeFile(join(currentServerConfig.server_dir, file), buf);
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
	if(!await exists(currentServerConfig.server_dir)) await mkdir(currentServerConfig.server_dir, { recursive: true });
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

async function updateVelocity() {
	const versions = await PaperAPI.getProject("velocity");
	const latestVersion = versions.versions[versions.versions.length - 1];
	const builds = await PaperAPI.getBuildsForVersion("velocity", latestVersion);
	const latestBuild = builds.builds[builds.builds.length - 1];
	const buildInfo = await PaperAPI.getBuildInfo("velocity", latestVersion, latestBuild);
	if(await exists(join(currentServerConfig.server_dir, "velocity.jar")) && await sha256(join(currentServerConfig.server_dir, "velocity.jar")) == buildInfo.downloads.application.sha256) return;
	await PaperAPI.downloadBuild("velocity", latestVersion, latestBuild, buildInfo.downloads.application.name, "velocity.jar");
}

async function copyConfigs() {
	for(const template of currentServerConfig.template) {
		const dir = join("bootstrap", template);
		const files = await readdir(dir);
		await cp(dir, currentServerConfig.server_dir, { recursive: true });
	}
}

async function luckperms() {
	const all = await fetch("https://metadata.luckperms.net/data/all").then(res => res.json());
	const LUT = {
		velocity: "velocity",
		paper: "bukkit"
	}
	const latest = all.downloads[LUT[currentServerConfig.type]];
	await download(latest, join("plugins", "LuckPerms.jar"));
}

for(const server of config) {
	currentServerConfig = server;
	await createBasicServerStructure();
	if(currentServerConfig.type == "velocity") {
		await updateVelocity();
	} else {
		await acceptEULA();
		await updatePaper(currentServerConfig.type);
	}
	await copyConfigs();
	if(currentServerConfig.spiget_resources) {
		for(const resource of currentServerConfig.spiget_resources) await downloadSpigetResource(resource, join("plugins", resource + ".jar"));
	}
	if(currentServerConfig.hangar_projects) {
		for(const project of currentServerConfig.hangar_projects) {
			const latestVersion = await HangarAPI.getLatestVersion(project.author, project.slug, project.channel);
			await HangarAPI.downloadVersion(project.author, project.slug, latestVersion, currentServerConfig.type.toUpperCase(), join("plugins", project.slug + ".jar"));
		}
	}
	if(currentServerConfig.plugin_urls) {
		for(const url of currentServerConfig.plugin_urls) {
			if(typeof url == "string") {
				const file = url.split("/").pop();
				await download(url, join("plugins", file));
			} else {
				await download(url.url, join("plugins", url.file));
			}
		}
	}
	if(currentServerConfig.luckperms) await luckperms();
}
