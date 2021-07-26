require('dotenv').config()
const fs = require('fs')
const request = require('request')
const path = require('path')
const prettier = require('prettier')
const prefix = path.resolve(__dirname, process.env.API_PREFIX)
const createMethod = (name, url, method, params = [], paramKeys, summary) => {
  const uniqueName = name + method.toUpperCase()
  const comment = []
  params.forEach(param => {
    comment.push(`@${param.name} ${param.type} ${param.description}`)
  })
  let tempUrl = `'${url}'`

  if (paramKeys.length) {
    tempUrl = [tempUrl, '+', '`', paramKeys.map(item => ['/${', item, '}'].join('')).join(''), '`'].join('')
  }
  const _params = params.filter(item => item.in !== 'path')
  const paramPlaceholder = _params.length ? `${paramKeys.length ? ',' : ''} params` : ''
  const commentContent = !comment.length ? '' : `  /**
   * ${summary || ''}
   ${comment.map(item => `* ${item}`).join('\n')}
 */`
  return `
  ${commentContent}
  const ${uniqueName} = async (${paramKeys.join(',')} ${paramPlaceholder}) => {
    return request({
      url: ${tempUrl},
      method: '${method}'
      ${method === 'get' ? paramPlaceholder ? ',params' : '' : paramPlaceholder ? `,data: params` : ''},
    })
  }
  `
}

const createClasses = (definitions) => {
  const classes = []
  Object.keys(definitions).forEach(clazz => {
    let className = clazz
    const t = clazz.split('.')
    if (t.length === 2) {
      className = t[1]
    }
    if (/^Page/.test(clazz)) return
    const classContent = []
    const classItem = definitions[clazz]
    if (classItem.properties) {
      Object.keys(classItem.properties).forEach(item => {
        const property = classItem.properties[item]
        const value = property.$ref ? '{}' : 'undefined'
        classContent.push(`
      /*
       * ${property.description}
      **/
      ${item}= ${value}`)
      })
    }
    const classBody = `
    export class ${className} {
      ${classContent.join('\n')}
    }
    `
    classes.push({
      id: clazz,
      content: classBody
    })
  })
  return classes
}
const formatJson = (str) => {
  return prettier.format(str, {
    parser: 'babel',
    semi: false,
    printWidth: 120,
    trailingComma: 'none',
    useTabs: false,
    tabWidth: 2,
    singleQuote: true
  })
}

const toUpCase = str => {
  return str.replace(/\/\w/g, function (str) {
    return str.replace(/\//, '').toUpperCase()
  })
}

const generate = async () => {
  request(`${process.env.SWAGGER_API_JSON}`, (error, response) => {
    removeDir(prefix)
    const result = JSON.parse(response.body)
    const apiList = {}

    Object.keys(result.paths).forEach(item => {
      const app = item.replace(/\//, '').split('/')
      const api = app[0]
      if (!apiList[api]) {
        apiList[api] = []
      }
      let key = item.replace(/\//g, '').replace(/\{(.*?)}/, '$1')
      if (['delete'].includes(key)) {
        key = `do${key.replace(/[a-z]/, i => i.toUpperCase())}`
      }
      apiList[api].push(item)

    })

    Object.keys(apiList)
      .forEach(item => {
        const tempApiList = apiList[item].slice(0)
        tempApiList.forEach(suItem => {
          debugger
          suItem = (result.basePath === '/' ? '' : result.basePath) + suItem.split('/').filter(
            sss => !/{(.*?)}/g.test(sss)).join('/')
        })

        let resultContent = `
      import request from '${process.env.REQUEST_URL}'
    `
        const methods = []
        const currentApis = apiList[item]
        currentApis.forEach(key => {
          Object.keys(result.paths[key]).forEach(type => {
            const method = result.paths[key][type]
            let params = []
            if (key.match(/{(.*?)}/, '$1')) {
              const matchedParams = key.match(/{(.*?)}/g) || []
              params = params.concat(matchedParams.map(item => item.replace(/{(.*?)}/g, '$1')))
            }
            const name = toUpCase(key)
            resultContent += createMethod(name, key, type, method.parameters, params, method.summary)
            const uniqueName = name + type.toUpperCase()
            methods.push(uniqueName)
          })

        })

        resultContent += `export {${methods.join(',')}}`
        try {
          resultContent = formatJson(resultContent)
        } catch (e) {
          // todo
        }

        const path = `${prefix}${result.basePath}/${item}.js`
        checkDir(path)
        fs.writeFileSync(path, resultContent)

        // console.log('`${prefix}${result.basePath}/${item}.js`', `${prefix}${result.basePath}/${item}.js`)

      })

    const classes = createClasses(result.definitions)
    classes.forEach(item => {
      try {
        // console.log(`${prefix}${result.basePath}/models/${item.id}.js`)

        const path = `${prefix}${result.basePath}models/${item.id}.js`
        checkDir(path)
        fs.writeFileSync(path, formatJson(item.content))
      } catch (e) {
        // console.error(e)
        // console.log(item.id)
        // console.log(item.content)
      }
    })
  })


}

function checkDir(p) {
  const pathList = p.split('/')
  const path = pathList.slice(0, pathList.length - 1).join('/')
  try {
    let statObj = fs.existsSync(path); // fs.statSync同步读取文件状态，判断是文件目录还是文件。
    if (!statObj) {
      fs.mkdirSync(path, { recursive: true })
    }
  } catch (e) {
  }
}

function removeDir(p) {
  try {
    let statObj = fs.statSync(p); // fs.statSync同步读取文件状态，判断是文件目录还是文件。
    if (statObj.isDirectory()) { //如果是目录
      let dirs = fs.readdirSync(p) //fs.readdirSync()同步的读取目标下的文件 返回一个不包括 '.' 和 '..' 的文件名的数组['b','a']
      dirs = dirs.map(dir => path.join(p, dir))  //拼上完整的路径
      for (let i = 0; i < dirs.length; i++) {
        // 深度 先将儿子移除掉 再删除掉自己
        removeDir(dirs[i]);
      }
      fs.rmdirSync(p); //删除目录
    } else {
      fs.unlinkSync(p); //删除文件
    }
  } catch (e) {
  }
}



(async () => {
  await generate()
})()
