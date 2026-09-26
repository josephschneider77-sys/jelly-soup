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

export function rewriteRootUrls(html, bundle, base) {
  const prefix=base.endsWith('/')?base:`${base}/`
  const withoutInlined=html.replace(/<link\b[^>]*>/g,tag => {
    if(!/\brel="preload"/.test(tag))return tag
    const href=tag.match(/\bhref="([^"]*)"/)?.[1]??''
    if(href.startsWith('data:'))return ''
    if(bundle&&href.startsWith('/src/assets/')) {
      const fileName=assetFileName(bundle,href.slice(1))
      if(!fileName||String(fileName).startsWith('data:'))return ''
    }
    return tag
  })
  return withoutInlined.replace(/\b(href|src)="\/([^"]+)"/g,(match,attr,path) => {
    if(!/^(logo\.png|src\/assets\/|src\/main\.ts)/.test(path))return match
    if(bundle&&path.startsWith('src/assets/')) {
      const fileName=assetFileName(bundle,path)
      if(fileName&&!String(fileName).startsWith('data:'))return `${attr}="${prefix}${fileName}"`
    }
    return `${attr}="${prefix}${path}"`
  }).replace(/<link\b[^>]*>/g,tag => /\brel="preload"/.test(tag)&&/\bhref="data:/.test(tag)?'':tag)
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
