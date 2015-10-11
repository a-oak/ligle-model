var ligle={};
ligle.util=require('ligle-util')();
var configure = ligle.util.configure;

var defaultCfg = {
  upDir:'./',
  staticDir:'/',
  loggerName:'ligle-model',
  loggerLevel:'TRACE',
};

var exportObj;

module.exports = function(config){// jshint ignore:line
  if(exportObj) {
    return exportObj;
  }
  exportObj = {};
  var cfg = configure(config,defaultCfg);
  var logger = ligle.util.logger(cfg.loggerName,cfg.loggerLevel);
  module.exports.logger = logger;
  module.exports.cfg = cfg;
  logger.trace('config:',cfg);

  // config中必须提供db实例
  if(!cfg.db){
    var msg = 'cannot define model without db instance';
    logger.error(msg);
    throw Error(msg);
  }
  module.exports.db = cfg.db; //导出以便其他类使用db。
  // 加载模型
  exportObj.ModelBase = require('./model-base.js');
  exportObj.cfg = cfg;
  return exportObj;
};// jshint ignore:line
