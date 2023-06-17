import { writeFile } from "fs/promises";

async function download(url, file) {
	console.log(`Downloading ${url} into ${file}`);
	await writeFile(file, Buffer.from(await fetch(url).then(res => res.arrayBuffer())));
}

const MC_VERSION = "1.19.4";
const SPIGET_RESOURCES = [];

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

async function downloadSpigetResource(id, file) {
	await download(`https://api.spiget.org/v2/resources/${id}/download`, file);
}

async function updatePaper() {
	const builds = await PaperAPI.getBuildsForVersion("paper", MC_VERSION);
	const latestBuild = builds.builds[builds.builds.length - 1];
	const buildInfo = await PaperAPI.getBuildInfo("paper", MC_VERSION, latestBuild);
	await PaperAPI.downloadBuild("paper", MC_VERSION, latestBuild, buildInfo.downloads.application.name, "paper.jar");
}

updatePaper();
for(const resource of SPIGET_RESOURCES) downloadSpigetResource(resource.id, resource.file);
