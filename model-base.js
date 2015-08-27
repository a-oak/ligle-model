var index = require('./index.js');
var ligle={};
ligle.util=require('ligle-util');
ligle.db = index.db;

var Class = ligle.util.Class;
var isEmpty = ligle.util.isEmpty;
var noop = ligle.util.noop;

var logger = index.logger;
var cfg = index.cfg;

var fs = require('fs');
var path = require('path');
var moment = require('moment');

// 模型基类
var ModelBase = Class.extend({
  __className:'ModelBase',// 默认使用它作为__upDir
  __upDir:null,
  // {name:xxx,fields:{key:type...} 数据表行为定义
  // name 数据库的表名
  // fields 可以存入数据库的域。如果为空，可以任意存储。
  // safe (optional) 是否进行类型检查
  coll:{},    

  // {name:{url:xxx,fields:{key:type,..},headers{},method:xxx}...} rest行为定义
  // name rest请求的名字
  // url  rest请求的地址
  // fields 需要发送的内容
  // headers 需要发送的headers
  // method post or get
  rest:{},    

  // mongodb的collection对象
  collection:null,

  // 构造函数
  init:function(obj){
    // logger.trace('init: ',this.__className);
    this.addData(obj);
    this._init();
  },
  /**
   * 添加数据
   * @method
   * @param {object} obj 添加到本模型中的数据
   * @return {null}
   */
  addData:function(obj){
    // logger.trace('adding Data');
    for(var k in obj){
      if(obj.hasOwnProperty(k))// 不会拷贝prototype里面的值。bugfix!
        this[k] = obj[k];
    }
  },
  /**
   * 处理文件上传。（注意，如果coll指定了数据表存储项，那么需要定义
   * 对应文件的项为file类型。）
   * @method
   * @param {object} reqFiles 直接传入req.files就可以。(后面的文档是
   * 测试使用，不必看) req.files={field:filedesc,...}, filedesc为
   * object或array。为object时，filedesc={originalname:xxx,path:xxx}。
   * 处理之后，文件保存在cfg.upDir+this.__upDir，返回到数据库里的位
   * 置是cfg.staticDir+this.__upDir。
   * @return {null}
   */
  processFiles:function(reqFiles){
    logger.trace('processing files');
    if(!this._checkColl()) return;
    for(var field in reqFiles){
      if(this._getFieldDesc(field)==='file' || 
         this._getFieldDesc(field)==='any'){
        var filedesc = reqFiles[field];
        this._rmOlderFiles(field);
        this._processOne(field,filedesc);
          }
    }
  },

  /**
   * 获取一个对象
   * @method
   * @param {object} query 查询条件
   * @param {object} [options=null] 高级查询选项（可选，参见文件前面部分的描述）
   * @param {function} callback 回调函数
   * @return {null}
   */
  get:function(){
    logger.trace('get object');
    // get arguments
    var query=arguments[0]
    , options
    , callback;
    switch(arguments.length){
     case 2:
      callback=arguments[1];options={};break;
     case 3:
      callback=arguments[2];options=arguments[1];break;
    default:
      logger.error('use model get error!!');
      return;
    }
    // 
    var self = this;
    if(!this._checkColl()) return callback(this.errMsg);
    if(!this._convertId(query)) return callback(this.errMsg);
    var cb = this._cbConverter(callback);
    this.collection.findOne(query,options,cb);
  },
  /**
   * 获取一组对象
   * @method
   * @param {object} query 查询条件
   * @param {object} [options=null] 高级查询选项（可选，参见文件前面部分的描述）
   * @param {function} callback 回调函数
   * @return {null}
   */
  getList:function(){
    logger.trace('ModelBase::getList');
    var query=arguments[0]
    , options
    , callback;
    switch(arguments.length){
     case 2:
      callback=arguments[1];options={};break;
     case 3:
      callback=arguments[2];options=arguments[1];break;
    default:
          logger.error('use model getList error!!');
      return;
    }
    // 
    var self = this;
    if(!this._checkColl()) return callback(this.errMsg);
    if(!this._convertId(query)) return callback(this.errMsg);
    var cb = this._cbConverter(callback);
    this.collection.find(query,options).toArray(function(err,docs){
      docs.forEach(function(o,i){
        self._objConverter(o);
      });
      callback(err,docs);
    });
  },
  /**
       * 保存对象。如果设置了_id则更新，否则则插入。检查行为根据数据表配
       * 置this.coll进行检查。
       * @method
       * @param {function} [callback=noop] 回调函数
       * @return {null}
       */
  save:function(callback){
    logger.trace('save object');
    callback = callback||noop;
    if(!this._checkColl()) return callback(this.errMsg);
    var self=this;

    if(isEmpty(this.coll.fields)){
      var objToSave = {};
      var keyExclude = ['_super','query'];
      // 排除掉prototype中的属性，以及keyExclude（用来内部使用的）
      for(var key in this){
        if(this.hasOwnProperty(key) && 
           keyExclude.indexOf(key)===-1)
          objToSave[key]=this[key];
      }
      // 如果没有指定fields，那么都可以存
      this._saveDb(objToSave,callback);
    }else{
      var obj = {};
      var fields = this.coll.fields;
      if(!this.coll.safe){
        // 正常的存储。按照域保存，但是不做类型检查
        for(var key in fields){
          obj[key]=this[key];
        }
      }else{
        for(var key in fields){
          // 进行类型检查。
          if(typeof(this[key])==='string' && fields[key]==='file'){
            var pObj = path.parse(this[key]);
            if(pObj.ext==='')return callback(key+' is not a file'+this.__className);
            obj[key]=this[key];
          }else if(typeof(this[key])!==fields[key]){
            return callback(key+' is not conformed with coll config:'+this.__className);
          }else{
            obj[key]=this[key];
          }
        }
      }
      // saving accordingly
      this._saveDb(obj,callback);
    }
  },
  /**
   * 删除一个对象
   * @method
   * @param {object} query 查询条件
   * @param {object} [options=null] 高级查询选项
   * @param {function} callback 回调函数 res.value:被删除的对象的projection
   * @return {null}
   */
  delete:function(){
    logger.trace('delete object');
    // get arguments
    var query=arguments[0]
    , options
    , callback;
    switch(arguments.length){
     case 2:
      callback=arguments[1];options={};break;
     case 3:
      callback=arguments[2];options=arguments[1];break;
    default:
      logger.error('use model delete error!!');
      return;
    }
    // 
    var self = this;
    if(!this._checkColl()) return callback(this.errMsg);
    if(!this._convertId(query)) return callback(this.errMsg);
    this.collection.findOneAndDelete(query,options,function(err,writeRes){
      if(!err){
        var deleted = writeRes.value;
        for(var key in deleted){
          self._rmOneOldFile(deleted[key]); // TODO: add unit test
        }
      }
      callback(err,writeRes);
    });
  },
  /**
   * 数有多少个符合条件的查询
   * @method
   * @param {object} query 查询条件
   * @param {object} [options=null] 高级查询选项（参见文件前面部分的描述）
   * @param {function} callback 回调函数 res:数目
   * @return {null}
   */
  count:function(){
    logger.trace('count object');
    // get arguments
    var query=arguments[0]
    , options
    , callback;
    switch(arguments.length){
     case 2:
      callback=arguments[1];options={};break;
     case 3:
      callback=arguments[2];options=arguments[1];break;
    default:
      logger.error('use model count error!!');
      return;
    }
    this.collection.count(query,options,callback);
  },
  /**
   * 数有多少个符合条件的查询
   * @method
   * @param {fileObj} 根据数据库保存的fileObj来删除文件。如果失败会
   * 抛出异常。fileObj必须有 path, isFile两个attribute。
   * @return {null}
   */
  removeUploadFile:function(fileObj){
    this._rmOneOldFile(fileObj);
  },
  getUploadDir:function(){
    return cfg.upDir+this._getUpDir()+'/';
  },
  getHostDir:function(){
    return cfg.staticDir+this._getUpDir()+'/';
  },
  host2UploadPath:function(hostDir){
    return cfg.upDir + hostDir.slice(cfg.staticDir.length);
  },
  upload2HostPath:function(path){
    return cfg.staticDir + path.slice(cfg.upDir.length);
  },
  getDbTableName:function(){
    return this.coll.name;
  },
  getDbFieldDef:function(){
    return this.coll.fields;
  },

  // not implemented
  restGet:function(queryObj,callback){
    callback = callback||noop;
  },
  restPost:function(postObj,callback){
    callback = callback||noop;
  },

  /////////////////////////// private functions
  _getUpDir:function(){
    if(!this.hasOwnProperty('__upDir')) return this.__className;
    return this.__upDir;
  },
  //////// INITIALIZATION
  _bInit:false,
  _init:function(){
    if(this._bInit) return;
    this._makeUploadDir();
    this._setCollection();
    this.__proto__._bInit=true; 
  },
  _clearErrMsg:function(){
    this.errMsg=null;
  },
  _setCollection:function(){
    logger.trace('_setCollection');
    if(!this._checkColl()) {
      this._clearErrMsg();
      logger.info('not creating database table because of lack of coll definition');
      return;
    }
    this.__proto__.collection = ligle.db.collection(this.coll.name);
    //logger.debug(this.collection);
  },
  _makeUploadDir: function(){
    logger.trace('_makeUploadDir');

    var upDir = cfg.upDir+this._getUpDir();
    logger.trace('checking directory:',this.__classname,upDir);
    if(fs.existsSync(upDir)){
      var s = fs.statSync(upDir);
      if(s.isDirectory()) {
        this.__proto__._bInit=true;
        return;
      }
      else throw 'creating upload directory failed:'+this.__classname+':'+upDir;
    }
    logger.info('creating directory:',upDir);

    fs.mkdirSync(upDir);
  },
  //////// END INITIALIZATION
  _rmOlderFiles:function(field){
    var self = this;
    var oldData = this[field];
    if(oldData instanceof Array){
      oldData.forEach(function(o,i){
        self._rmOneOldFile(o);
      });
    }else{
      self._rmOneOldFile(oldData);
    }
  },
  _rmOneOldFile:function(filedesc){
    //console.log(filedesc);
    if(!filedesc) return;
    if(!filedesc.isFile) return;
    if(!filedesc.path) return;
    if(typeof filedesc.path !== 'string') return;
    // we need to get true path
    var path = cfg.upDir + filedesc.path.slice(cfg.staticDir.length);
    fs.unlinkSync(path);
    logger.trace('removed',path);
    //console.log('removed',path);
  },

      _processOne:function(field,filedesc){
        logger.trace('processing field:',field);
        var self = this;
        if(filedesc instanceof Array){
          logger.trace('processing field: an array');
          this[field]=[];
          filedesc.forEach(function(o,i){
            self[field].push(self._processOneFile(o));
          });
        }else{
          logger.trace('processing field: an object');
          this[field]=this._processOneFile(filedesc);
        }
        // may be discuss in future!!

        // we change the coll definition to make sure the filename would
        // saved into database
        var collfields = this.__proto__.coll.fields;
        if(!isEmpty(collfields) && !collfields[field]) collfields[field]='file';
      },
  _processOneFile:function(file){
    logger.trace('processing',file.path);
    var path = this._saveFile(file.path);
    var origin = file.originalname;
    return {path:path,origin:origin,isFile:true};
  },
  _saveFile:function(pth){
    logger.trace('saving',pth);
    var filename = path.parse(pth).base;
    var upDir = cfg.upDir+this._getUpDir();
    var newpth = upDir+'/'+filename;
    logger.trace('saved into',newpth);
    fs.renameSync(pth,newpth);
    return cfg.staticDir+this._getUpDir()+'/'+filename;//用于前端查找的路径
  },
  _getFieldDesc:function(fieldname){
    if(fieldname in this.coll.fields){
      return this.coll.fields[fieldname];
    }else{
      return 'any';
    }
      },
  _cbConverter:function(callback){
        return function(err,obj){
          obj = this._objConverter(obj);
          callback(err,obj);
        }.bind(this);
  },
  _objConverter:function(obj){
        if(obj){
          obj.__proto__ = this.__proto__;
          obj.init();
        }
    return obj;
  },
  _convertId:function(query){
    if(!query._id){
      return true;
    }
    if(typeof query._id ==='string'){
      try{
        query._id = ligle.db.ObjectID(query._id);
      }catch(e){
        this.errMsg = '转换id失败'+e;
        return false;
      }
    }
    return true;
  },
  _checkColl:function(){
    if(isEmpty(this.coll)) {
      this.errMsg = '没有表的meta定义--'+this.__classname;
      logger.error(this.errMsg);
      return false;
    } 
    if('name' in this.coll)
      return true;
    else{
      this.errMsg = '表meta定义中，没有指定表名--'+this.__classname;
      logger.error(this.errMsg);
      return false;
    }
  },
  _saveDb:function(obj,callback){
    obj._time = moment().toISOString();
    var self=this;
    if(obj._id){
      //console.log('_save1',obj);
      this.collection
        .findOneAndReplace({_id:obj._id},obj,{returnOriginal:false},function(err,writeOpRes){
          //console.log('_save2',err,writeOpRes);
          var cb = self._cbConverter(callback);
          if(!writeOpRes)
            cb(err,null); // happened occasionally, not know why!
          else
            cb(err,writeOpRes.value); 
        });
    }else{
      this.collection.insertOne(obj,function(err,writeOpRes){
        if(err) return callback(err);
        self.collection.findOne({_id:writeOpRes.ops[0]._id},self._cbConverter(callback));
      });
    }
  },
});

module.exports = ModelBase;
