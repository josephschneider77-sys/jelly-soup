// vite.config.js
import { defineConfig } from 'vite'

const runtimeSourceSuffix='/src/app/runtime.ts'

function assetFileName(bundle, rootPath) {
  const norm=name => String(name).replaceAll('\\','/')
  const assets=Object.values(bundle).filter(output => output.type==='asset')
  const namesOf=output => [output.name,output.originalFileName,...(output.originalFileNames??[]),...(output.names??[])]
  const full=assets.filter(output => namesOf(output).some(name => name&&(norm(name)===rootPath||norm(name).endsWith('/'+rootPath))))
  if(full.length===1)return full[0].fileName
  const baseName=rootPath.split('/').pop()
  const loose=assets.filter(output => namesOf(output).some(name => name&&(norm(name)===baseName||norm(name).endsWith('/'+baseName))))
  return loose.length===1?loose[0].fileName:null
}

function rewriteRootUrls(html, bundle, base) {
  const prefix=base.endsWith('/')?base:`${base}/`
  return html.replace(/\b(href|src)="\/([^"]+)"/g,(match,attr,path) => {
    if(!/^(logo\.png|src\/assets\/|src\/main\.ts)/.test(path))return match
    if(bundle&&path.startsWith('src/assets/')) {
      const fileName=assetFileName(bundle,path)
      if(fileName)return `${attr}="${prefix}${fileName}"`
    }
    return `${attr}="${prefix}${path}"`
  })
}

function runtimeModulePreload() {
  let base='/'

  return {
    name:'jelly-runtime-module-preload',
    configResolved(config) {
      base=config.base
    },
    transformIndexHtml: {
      order:'post',
      handler(html,context) {
        let href=`${base}src/app/runtime.ts`

        if(context.bundle) {
          const runtimeChunk=Object.values(context.bundle).find(output =>
            output.type==='chunk'&&output.facadeModuleId?.endsWith(runtimeSourceSuffix)
          )

          if(!runtimeChunk)throw new Error('Unable to find the emitted runtime chunk for modulepreload')
          href=`${base}${runtimeChunk.fileName}`
        }

        return {
          html:rewriteRootUrls(html,context.bundle,base),
          tags:[{
            tag:'link',
            attrs:{rel:'modulepreload',href},
            injectTo:'head'
          }]
        }
      }
    }
  }
}

export default defineConfig({
  base:'/jelly-soup/',
  plugins:[runtimeModulePreload()],
  server: {
    allowedHosts: true
  },
  preview: {
    allowedHosts: true
  }
})
