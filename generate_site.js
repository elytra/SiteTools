var Hjson = require('hjson');
var md = require('markdown-it')();
var pug = require('pug');
var stylus = require('stylus');
var nib = require('nib');
var request = require('request');
var cp = require('child_process');
var fs = require('fs');
var path = require('path');

// *shrug*
//cp.execSync('rm -rf out tmp');
cp.execSync('rm -rf out/*');
cp.execSync('mkdir -p out tmp');
cp.execSync('cp -r static/* out');

fs.writeFileSync('out/app.css',
		stylus(fs.readFileSync('templates/app.styl').toString('utf8'))
		.set('filename', 'templates/app.styl')
		.use(nib)
		.render());

var mergedJson = [];
var page = 1;
console.log("Getting repository list...");
function advance() {
	request({
		uri: "https://api.github.com/orgs/elytra/repos?page="+page,
		headers: {
			"User-Agent": "Mozilla/5.0 (Elytra SiteTools; Node.js request)"
		}
	}, (err, res, body) => {
		if (err) {
			console.error(err);
		} else {
			var json = JSON.parse(body);
			if (json.length == 0) {
				doClone(mergedJson);
			} else {
				mergedJson = mergedJson.concat(json);
				page++;
				advance();
			}
		}
	});
}
advance();

function doClone(json) {
	var compiledProject = pug.compileFile('templates/project.pug');
	var totalProjectCount = 0;
	var jenkinsProjectCount = 0;
	var metadataProjectCount = 0;
	json.forEach((repo) => {
		console.log("Cloning "+repo.name+"...");
		//cp.spawnSync('git', ['clone', '--depth', '1', repo.clone_url, repo.name], {cwd: 'tmp'});
		totalProjectCount++;
		var metadir = path.join('tmp', repo.name, '.elytra', 'site');
		if (fs.existsSync(metadir)) {
			metadataProjectCount++;
			var metadata = Hjson.parse(fs.readFileSync(path.join(metadir, 'metadata.hjson')).toString('utf8'));
			var id = repo.id+"-"+cp.spawnSync('git', ['rev-parse', '--short', 'HEAD']).stdout.toString('utf8').trim();
			var assetdir = path.join('out', 'assets', id);
			cp.spawnSync('mkdir', ['-p', assetdir]);
			cp.spawnSync('cp', ['-r', path.join(metadir, 'logo.png'), path.join(assetdir, 'logo.png')]);
			cp.spawnSync('cp', ['-r', path.join(metadir, 'hero.png'), path.join(assetdir, 'hero.png')]);
			console.log("Rendering project page...");
			var descriptionHtml = md.render(fs.readFileSync(path.join(metadir, 'description.md')).toString('utf8'));
			fs.writeFileSync(path.join('out', metadata.modid+'.html'),
							 compiledProject(Object.assign({
								 id: id,
								 description: descriptionHtml,
								 title: repo.name,
								 homepage: repo.homepage,
								 issues: repo.html_url+'/issues',
								 repo: repo.html_url,
								 downloads: repo.html_url+'/releases'
							 }, metadata)));
			
			fs.writeFileSync(path.join(assetdir, 'style.css'),
							 stylus(fs.readFileSync('templates/project.styl').toString('utf8'))
							 .set('filename', 'templates/project.styl')
							 .set('$id', id)
							 .use(nib)
							 .render());
		}
		if (fs.existsSync(path.join('tmp', repo.name, 'Jenkinsfile'))) {
			jenkinsProjectCount++;
		}
	});
	console.log("Rendering index page...");
	fs.writeFileSync(path.join('out', 'index.html'), pug.compileFile('templates/index.pug')({
		totalProjectCount: totalProjectCount,
		metadataProjectCount: metadataProjectCount,
		jenkinsProjectCount: jenkinsProjectCount
	}));
}
