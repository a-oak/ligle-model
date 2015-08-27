var ligle={}
ligle.util=require('ligle-util');
var configure = ligle.util.configure;
// 数据库的用法：
// http://mongodb.github.io/node-mongodb-native/2.0/api/Collection.html
// 常用的接口：
// find, findOne, findOneAndReplace, findOneAndDelete, drop
// 关于常用的options的说明：
// - limit: 返回条目的数目。
// - sort: 对文档排序。 [['name',-1]] 按照name倒序；[['a',1]]按照a正序
// - skip: Set to skip N documents ahead in your query (useful for pagination).
// - fields:（用在find中） 返回的field. include or exclude (not both)。例子： {'a':1} 
// - projection: (和fields类似，但用在delete,replace,update中) Limits the fields to return for all matching documents. 


var defaultCfg = {
  upDir:'./',
  staticDir:'/',
  loggerName:'ligle-model',
  loggerLevel:'TRACE'
};

var exportObj;

module.exports = function(config){
  if(exportObj) return exportObj;
  exportObj = {};
    
  var cfg = configure(config,defaultCfg);
  var logger = ligle.util.logger(cfg.loggerName,cfg.loggerLevel);
  module.exports.logger = logger;
  module.exports.cfg = cfg;
  logger.trace("config:",cfg);

  // config中必须提供db实例
  if(!cfg.db){
    var msg = "cannot define model without db instance";
    logger.error(msg);
    throw Error(msg);
  }
  module.exports.db = cfg.db; //导出以便其他类使用db。
  
  // 加载模型
  exportObj.ModelBase = require('./model-base.js');
  exportObj.cfg = cfg;
  return exportObj;
};

