var expect = require('chai').expect;
var should = require('chai').should();

var ligle={};
ligle.util = require('ligle-util');
ligle.db = require('ligle-db')();
ligle.model = require("./index.js")({db:ligle.db});

var collection;// test db setup
var Model; // test file, get, save, delete
var Model2;// test field check
var Model3;// test safe save

var delay = 100;// test must be delayed to avoid conflict
var n_test = 1; // used for delay

describe('ligle-model',function(){
  before(function(done){
    // must call ligle.base.start before all operation
    ligle.db.start(function(err,db){
      if(err) console.log(err);
      var coll = 'ligle-model-test';
      collection = db.collection(coll);
      Model = ligle.model.ModelBase.extend({
        __classname:coll,
        coll:{name:coll,fields:{}}
      });
      Model2 = ligle.model.ModelBase.extend({
        __classname:coll,
        coll:{name:coll,fields:{'no':'number','name':'string'}}
      });
      Model3 = ligle.model.ModelBase.extend({
        __classname:coll,
        coll:{name:coll,fields:{'no':'number','name':'string'},safe:true}
      });
      done();
    });    
  });

  it('should equal when the same module load many times',function(){
    var another_model = require('./index.js')();
    expect(ligle.model).to.deep.equal(another_model);
  });

  var obj,obj2,obj3;
  var tmp;
  it('init():test make upload dir',function(){
    obj= new Model({no:123,name:'lx',other:{a:1,b:2}});
    obj2= new Model2({no:123,name:'lx',other:{a:1,b:2}});
    obj3= new Model3({no:123,name:'lx',other:{a:1,b:2}});
    var hasDir = fs.existsSync(obj._getUpDir());
    expect(hasDir).to.equal(true);
    if(hasDir){
      var statDir = fs.statSync(obj._getUpDir());
      expect(statDir.isDirectory()).to.equal(true);
    }
  });
  /////////////  unconstrained collection definition /////////
  it('save(),count(),get():insert->count->get->update',function(done){
    obj.save(function(err,insertedObj){//insert
      should.not.exist(err);
      should.exist(insertedObj);
      obj._id = insertedObj._id;// save it for use in next test
      obj.count({},function(err,number){//count
        should.not.exist(err);
        expect(number).to.equal(1);

        obj.get({_id:insertedObj._id},function(err,getObj){//get
          should.not.exist(err);
          expect(getObj._id).to.deep.equal(insertedObj._id);

          getObj.no = 234;
          delete getObj.other;

          getObj.save(function(err,updatedObj){//update
            should.not.exist(err);
            expect(updatedObj._id).deep.equal(getObj._id);
            done();
          });// end update
        });// end get
      });// end count
    });//end insert
  });
  it('delete(): delete the first we get',function(done){
    setTimeout(function(){
      obj.delete({},function(err,res){
        should.not.exist(err);
        expect(''+res.value._id).to.equal(''+obj._id);
        obj.count({},function(err,number){
          should.not.exist(err);
          expect(number).equal(0);
          done();
        });
      })
    },n_test*delay);
    n_test = n_test + 1;
  });
  it('processFiles(): file uploading test',function(done){
    var reqfiles = {cover:{originalname:'1.txt',path:'haha1.txt'}};
    var reqfiles_ = {cover:{originalname:'1.txt',path:'hahaha1.txt'}};
    var reqfiles2 = {
      covers:[
            {originalname:'2.txt',path:'haha2.txt'},
        {originalname:'3.txt',path:'haha3.txt'}
      ]};
    var reqfiles2_ = {
      covers:[
        {originalname:'2.txt',path:'hahaha2.txt'},
        {originalname:'3.txt',path:'hahaha3.txt'}
      ]};

    var tmpDir = ligle.model.cfg.upDir;//total updir
    var staticDir = ligle.model.cfg.staticDir;//total updir
    var upDir = obj._getUpDir();//model updir

    setTimeout(function(){
      /// stage1: make test file and move it to folder
          var oldfiles_ = [
            tmpDir+'/'+reqfiles_.cover.path,
            tmpDir+'/'+reqfiles2_.covers[0].path,
            tmpDir+'/'+reqfiles2_.covers[1].path
          ];
      var newfiles_ = [
        upDir+'/'+reqfiles_.cover.path,
        upDir+'/'+reqfiles2_.covers[0].path,
        upDir+'/'+reqfiles2_.covers[1].path
      ];
      oldfiles_.forEach(function(o,i){
        fs.writeFileSync(o);
      });
      obj.processFiles(reqfiles_);// now is sync operation, may changed in future
      obj.processFiles(reqfiles2_);// now is sync operation, may changed in future


      /// stage2: delete oldfileds make test file and move it to folder
      var oldfiles = [
        tmpDir+'/'+reqfiles.cover.path,
        tmpDir+'/'+reqfiles2.covers[0].path,
        tmpDir+'/'+reqfiles2.covers[1].path
          ];
      var newfiles = [
        upDir+'/'+reqfiles.cover.path,
        upDir+'/'+reqfiles2.covers[0].path,
        upDir+'/'+reqfiles2.covers[1].path
      ];
          oldfiles.forEach(function(o,i){
            fs.writeFileSync(o);
          });
      obj.processFiles(reqfiles);// now is sync operation, may changed in future
      obj.processFiles(reqfiles2);// now is sync operation, may changed in future

      newfiles_.forEach(function(o,i){// first upload files is removed!
        var exist = fs.existsSync(o);
        expect(exist).equal(false);
      });

      newfiles.forEach(function(o,i){
        var exist = fs.existsSync(o);
        expect(exist).equal(true);
        fs.unlinkSync(o);
      });
      // save database and check

      // notice!!!!: obj._id would try to find and update, so, we
      // must delete it for inserting purpose
      delete obj._id;
      obj.save(function(err,obj){
        should.not.exist(err);
        should.exist(obj);
        should.not.exist(err);
        expect(obj.cover.path).to.equal(staticDir+newfiles[0]);
        expect(obj.cover.origin).to.equal(reqfiles.cover.originalname);

        expect(obj.covers[0].path).to.equal(staticDir+newfiles[1]);
        expect(obj.covers[0].origin).to.equal(reqfiles2.covers[0].originalname);

        expect(obj.covers[1].path).to.equal(staticDir+newfiles[2]);
        expect(obj.covers[1].origin).to.equal(reqfiles2.covers[1].originalname);
        done();
      });
    },n_test*delay);
    n_test = n_test + 1;
  });
  it('getList() test',function(done){
    setTimeout(function(){
      var o = new Model({anotherone:'yep!'});
      o.save(function(err,o){
        should.not.exist(err);
        o.getList({},function(err,objs){
          should.not.exist(err);
          expect(objs.length).equal(2);
          expect(objs[0].no).equal(obj.no);
          expect(objs[1].anotherone).equal(o.anotherone);
          done();
        });
      });
    },n_test*delay);
    n_test = n_test + 1;
  });
  /////////////  half constrained collection definition /////////
  it('with Fields defined, but unsafe:insert->get->update',function(done){
    setTimeout(function(){
      obj2.save(function(err,insertedObj){//insert
        should.not.exist(err);
        should.exist(insertedObj);
        should.not.exist(insertedObj.other);
        obj2.get({_id:insertedObj._id},function(err,getObj){//get
          should.not.exist(err);
          should.not.exist(getObj.other);
          expect(getObj._id).to.deep.equal(insertedObj._id);
          getObj.no = 234;
          getObj.test='not saved';

          getObj.save(function(err,updatedObj){//update
            should.not.exist(err);
            should.exist(updatedObj);
            should.not.exist(updatedObj.test);

            expect(updatedObj.no).deep.equal(getObj.no);
            expect(updatedObj.name).deep.equal(getObj.name);
            done();
          });// end update
        });// end get
      });//end insert
    },n_test*delay);
    n_test = n_test + 1;
  });
  it('with Fields defined, but unsafe: process file',function(done){
    var reqfiles = {cover:{originalname:'1.txt',path:'haha1.txt'}};

    var tmpDir = ligle.model.cfg.upDir;//total updir
    var staticDir = ligle.model.cfg.staticDir;//total updir

    var upDir = obj2._getUpDir();//model updir
    setTimeout(function(){
      // make test file!!
      var oldfiles = [
        tmpDir+'/'+reqfiles.cover.path
      ];
      var newfiles = [
        upDir+'/'+reqfiles.cover.path
          ];
      var exist = [false];
      oldfiles.forEach(function(o,i){
            fs.writeFileSync(o);
      });

      obj2.processFiles(reqfiles);// now is sync operation, may changed in future
      newfiles.forEach(function(o,i){
        exist[i]=fs.existsSync(o);
        fs.unlinkSync(o);
        expect(exist[i]).equal(true);
          });

      // test if the file field is saved!!
      delete obj2._id;
      obj2.save(function(err,obj){
        should.not.exist(err);
        should.exist(obj);
        should.not.exist(err);
        expect(obj.cover.path).to.equal(staticDir+newfiles[0]);
        expect(obj.cover.origin).to.equal(reqfiles.cover.originalname);

        done();
      });

    },n_test*delay);
    n_test = n_test + 1;
  });
  /////////////  safe collection definition /////////
  it('with Fields defined, safe mode:insert->get',function(done){
    setTimeout(function(){
      obj3.no='dsa';
      obj3.save(function(err,insertedObj){//insert
        should.exist(err);
        should.not.exist(insertedObj);
        obj3.no = 112;
        obj3.save(function(err,insertedObj){
          should.not.exist(err);
          should.exist(insertedObj);
          should.not.exist(insertedObj.other);

          obj3.get({_id:insertedObj._id},function(err,getObj){//get
            should.not.exist(err);
            should.not.exist(getObj.other);
            expect(getObj).deep.equal(insertedObj);
            done();
          });// end get

        });//end insert
      });//end insert
    },n_test*delay);
    n_test = n_test + 1;

    after(function(){
      fs.rmdirSync(obj._getUpDir());
    });
  });


  after(function(done){
    collection.drop(function(){
      ligle.db.close();
      done();
    });
  });
});
