/**
 * 使用 GitHub API 部署到 gh-pages 分支
 * 因为 HTTPS 端口被墙但 gh CLI 的 API 可用
 */
import { execSync } from 'child_process';
import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, relative, sep } from 'path';

const OWNER = 'shuren188';
const REPO = 'puzzle-photo-frame';
const DIST = join(import.meta.dirname, 'dist');
const API = `repos/${OWNER}/${REPO}`;

function gh(method, url, body = null) {
  const args = ['gh', 'api', '-X', method, url];
  if (body) {
    args.push('--input', '-');
  }
  const opts = body ? { input: JSON.stringify(body) } : {};
  try {
    const out = execSync(args.join(' '), {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      ...opts,
    });
    return JSON.parse(out);
  } catch (e) {
    console.error('API Error:', e.message);
    process.exit(1);
  }
}

async function deploy() {
  console.log('📦 读取 dist 文件...');
  // 收集所有文件
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const rel = relative(DIST, full).replace(/\\/g, '/');
        files.push({ path: rel, filepath: full });
      }
    }
  }
  walk(DIST);
  console.log(`  共 ${files.length} 个文件`);

  // 1. 创建每个文件的 blob
  console.log('📤 上传文件 blobs...');
  const treeEntries = [];
  for (const f of files) {
    const content = readFileSync(f.filepath);
    const base64Content = content.toString('base64');
    const blob = gh('POST', `${API}/git/blobs`, {
      content: base64Content,
      encoding: 'base64',
    });
    treeEntries.push({
      path: f.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
    if (treeEntries.length % 10 === 0) {
      process.stdout.write(`  ${treeEntries.length}/${files.length}\r`);
    }
  }
  process.stdout.write(`  ${treeEntries.length}/${files.length} ✓\n`);

  // 2. 创建 tree
  console.log('🌳 创建 git tree...');
  const tree = gh('POST', `${API}/git/trees`, {
    tree: treeEntries,
  });

  // 3. 获取当前 gh-pages head（如果存在）
  let parentSha = null;
  try {
    const ref = gh('GET', `${API}/git/refs/heads/gh-pages`);
    parentSha = ref.object.sha;
    console.log(`  当前 gh-pages head: ${parentSha.substring(0, 8)}`);
  } catch (e) {
    console.log('  gh-pages 分支不存在，将创建新分支');
  }

  // 4. 创建 commit
  console.log('📝 创建 commit...');
  const commit = gh('POST', `${API}/git/commits`, {
    message: 'deploy: via gh api',
    tree: tree.sha,
    parents: parentSha ? [parentSha] : [],
  });
  console.log(`  Commit: ${commit.sha.substring(0, 8)}`);

  // 5. 更新 ref
  console.log('🚀 更新 gh-pages 引用...');
  if (parentSha) {
    gh('PATCH', `${API}/git/refs/heads/gh-pages`, {
      sha: commit.sha,
      force: true,
    });
  } else {
    gh('POST', `${API}/git/refs`, {
      ref: 'refs/heads/gh-pages',
      sha: commit.sha,
    });
  }

  console.log('✅ 部署成功！');
  console.log(`  地址: https://${OWNER}.github.io/${REPO}/`);
}

deploy().catch(console.error);
