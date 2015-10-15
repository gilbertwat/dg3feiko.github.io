---
layout: post
title: Ways to mock dependencies for tests
---

Before Read
========
Code examples here are for demonstration only, parts that may detract readers are removed and simplied, e.g. mongodb without collection, yield without co.js, and connection of external services is ignored.


Example
============
Imagine that we have to build a data access layer which provides interfaces as `set(key, value)` and `get(key)` while it . Under the hood, we use `redis` for fast read, and `mongodb` for persistent storage.

```js
class DataStore{
	constructor(redis_client, mongodb_client){
		this.redis = redis_client;
		this.mongodb = mongodb_client;
	}
	
	get(key){
		try
		{
			let res = yield this.redis.get(key);
		}catch(e){
			logger.error("failed to get from cache")
		}
		if(res){
			return res;
		}else
		{
			let res = yield this.mongodb.findOne({"key": key});
		}
		return res.value;
	}
	
	set(key, value){
		try{
			yield redis.set(key, value);
		}catch(e){
			logger.error("failed to set cache")
		}		
		yield mongodb.update({"key":key}, {"key":"key", "value": value}, {"upsert": true})
	}
}
```

What we want to cover and verify
==============
* The flow is correct, cache first, and then db later.
* The data with external services is correct, e.g. when I set a key with "foo", there must be a record "foo" record in cache and db.
* The strategy is correct, if cache failed, the code still deliver the result to user.
* The behaviors are correct, user can get the same thing after they set it.

Way to Mock Dependencies
==============
Mocks are used to simulate the `behaviour` of objects, so that we can:
* get rip from the real infrastructures, real client, real implementation and real config
* control the input and output
* do assertion on it

For external dependencies (`external` means "scope out of the code you want to test against"), the main way to replace it with something you can easily access, control and measure.

Mocking is one usual way to achieve this.


Cloned Infrastructure
===============
To test it with mocked dependencies, one way is set up a local redis server and mongo server.

```js
describe("DataStore", function(){
	it("should have record in cache and db when set", function(){
		var redis = new Redis({host: "localhost"});
		var mongodb = new MongoDB({host: "localhost"});
		var ds = new DataStore(redis, mongodb);
		yield ds.set("foo", "bar");
				
		expect(redis.get("foo")).to.be("bar");
		expect(mongodb.findOne({"key": "foo")).value).to.be("bar");
	})
});
``` 

but you usually have to write a (bash) scirpt to prepare the servers;

```bash
#start redis server
redis-server
#start mongodb server
mongod
#reset states
redis-cli -h 127.0.0.1 flushall
mongo 127.0.0.1 removeall
# start tests
mocha .
```

So using real infrasturcture to test:
* guaranteed identical behavious
* hard to get full control, especially for managed cloud services though some service provider and local version for test, like AWS has `dyanmodb-local`, but it stil needs you some knowledge to operate.
* it slows down the process as it is running real servers and introduce many noise to the test. 


Manual Mocking
=============
As javascript is very flexible and get() set() in redis is easy to implement, so it is not hard to build a mock from scratch. Let's have a simple test case first, by which we want to verify that `cache is set`; 
```js

class MockRedis{
	constructor(){ this.map = {}; }
	set(key, value){ this.map[key] = value;}
	get(key){ return this.map[key];}	
}

describe("DataStore", function(){
	it("should have record in cache when set", function(){
		var mocked_redis = new MockRedis(); var mocked_mongodb = new MockedMongodb();
		var ds = new DataStore(mocked_redis, mocked_mongodb);
		yield ds.set("foo", "bar");
		expect(mocked_redis.get("foo")).to.be("bar");
	})
});

```

Manual mocking:
* fast, simple, fully controlled
* only good for very simple behavious and verification
* need many facilities to do accurate assertion, e.g. if we cares about how many times the set() is called with same args, we need to have a counter and non-trivial counting logic.


Fake Implementation
================
For famous services, there are usually some useful fake(or fully mocked) implementation in npm.

For example, `fakeredis` for redis, and `mongo-mock` for mongodb.

```js
describe("DataStore", function(){
	it("should have record in cache and db when set", function(){
		var redis = new FakeRedis();
		var mongodb = new MongoDBMock();
		
		var ds = new DataStore(redis, mongodb);
		yield ds.set("foo", "bar");
						
		expect(redis.get("foo")).to.be("bar");		
		expect(mongodb.findOne({"key": "foo")).value).to.be("bar");
	})
});
```

Fakes:
* Handy to use
* no real in
* usually simulate a large part the behavious
* but sometimes can not cover all features, like `fakeredis` do not support `lua scripting` and `pubsub`.
* verification usually involve knowledges of the dependencies.
  

Spy and Stub
======================
Let's step back a little bit from the problem scope. Why we need to `do assertion on the mocked dependencies`? We just want to make sure our code does the correct interaction with external services and the `effects of interaction` can be somehow measured on the services.

Specifically, `We can get the value with the key from cache` is the expected consequence of `set cache with the key and value`. The latter thing is what we want to ensure, not the former part. So if we follow the minimalism principal of testing to strip out noise and unexpected efforts of test, we should care about the interaction only, which means, we only verify that our code calls the interfaces with expected input.

That's the reason why there are `Spy` and `Stub`. Essentially they are mocks, but with different features and uses. They simulate objects and help tests to verify interactions.

Here we use `sinon.js` to illustrate.


```js
describe("DataStore", function(){
	it("should have record in cache and db when set", function(){
		var redis = {
			set: sinon.spy()			
		};
		
		var mongodb = {
			update: sinon.spy()
		};
		
		var ds = new DataStore(redis, mongodb);
		yield ds.set("foo", "bar");
		
		
		expect(redis.set.calledWithArgs("foo","bar")).to.be.ok;		
		expect(mongodb.update.calledWithArgs({"key": "foo"}, {"key":"foo", "value": "bar"},{"upsert": true})).to.be.ok;
	})
});
```
Actually, we have an other behavior to test: `continue to work even the redis cache fails`.

Here comes `Stub`.
 
```js
describe("DataStore", function(){
	it("should continue to get result from db even cache fails", function(){
		var redis = {
			set: sinon.stub().throws(), // which throws en error once called 
			get: sinon.stub().throws()
		};
			
		var mongodb = {
			update: sinon.spy(),
			findOne: sinon.spy()
		};
		
		var ds = new DataStore(redis, mongodb);
		
		yield ds.set("foo", "bar");						
		expect(mongodb.update.calledWithArgs({"key": "foo"}, {"key":"foo", "value": "bar"},{"upsert": true})).to.be.ok;
		
		yield ds.get("foo");						
		expect(mongodb.findOne.calledWithArgs({"key": "foo"})).to.be.ok;			
	})
});
```

Or in a more functional test way:
```js
describe("DataStore", function(){
	it("should continue to get result from db even cache fails", function(){
		var redis = { 
			set: sinon.stub().throws(), // which throws en error once called 
			get: sinon.stub().throws()
		};
					
		var mongodb = require("mongo-mock");		
		var ds = new DataStore(redis, mongodb);
				
		yield ds.set("foo", "bar");										
		var res = yield ds.get("foo");
		
		expect(res).to.be("bar"); //even redis fails, I can get the result back						
					
	})
});
```

`Stub` can be helpful to test with complex interaction and states, as it gives you more control of the object, e.g.:

```js
describe("DataStore", function(){
	it("should have higher priority for cache", function(){		
		
		var redis = { 
			set: function(){} ,
			get: sinon.stub().onCall("foo").returns("not bar")
		};
					
		var mongodb = require("mongo-mock");		
		var ds = new DataStore(redis, mongodb);
				
		yield ds.set("foo", "bar");										
		var res = yield ds.get("foo");
		
		expect(res).to.be("not bar"); 						
					
	})
});
```

There are some other goodies from `Sinon.js` for mocking and assertion, please check http://sinonjs.org/docs/


Let's have a full test with `Sinon.js`.

```js
describe("DataStore", function(){
	it("set(key, value)", function(){
				
		it("should put records to cache and db", function(){
			
			var redis = {
				set: sinon.spy()			
			};
		
			var mongodb = {
				update: sinon.spy()
			};
			var ds = new DataStore(redis, mongodb);
			yield ds.set("foo", "bar");
			
			expect(redis.set.calledWithArgs("foo","bar")).to.be.ok;		
			expect(mongodb.update.calledWithArgs({"key": "foo"}, {"key":"foo", "value": "bar"},{"upsert": true})).to.be.ok;
		})
		
		it("should put cache record first and then db record", function(){
			var redis = {
				set: sinon.spy()			
			};
		
			var mongodb = {
				update: sinon.spy()
			};
			var ds = new DataStore(redis, mongodb);
			yield ds.set("foo", "bar");
			
			redis.set.calledBefore(mongodb.update)
		})
		
		it("should put cache record to db record even cache fails", function(){
			var redis = {
				set: sinon.stub().throws()			
			};
		
			var mongodb = {
				update: sinon.spy()
			};
			
			expect(mongodb.update.calledWithArgs({"key": "foo"}, {"key":"foo", "value": "bar"},{"upsert": true})).to.be.ok;
			
		})									
		
	})
	
	it("get(key)", function(){						
		
		it("should not touch db if key exists in cache", function(){
			
			var redis = {
				get: sinon.stub().onCall("foo").returns("bar");			
			};
		
			var mongodb = {
				findOne: sinon.spy()
			};
			
			var ds = new DataStore(redis, mongodb);
		    yield ds.get("foo");
			
			expect(mongodb.findOne.called).to.be.false;
		})
		
		it("should get from db if key does not exist in cache", function(){
			
			var redis = {
				get: sinon.stub().onCall("foo").returns(null);			
			};
		
			var mongodb = {
				findOne: sinon.spy()
			};
			
			var ds = new DataStore(redis, mongodb);
		    yield ds.get("foo");
			
			expect(mongodb.findOne.called).to.be.true;
		})
		
		it("should get from db even cache fails", function(){
			
			var redis = {
				get: sinon.stub().throws();			
			};
		
			var mongodb = {
				findOne: sinon.spy()
			};
			
			var ds = new DataStore(redis, mongodb);
						
		    yield ds.get("foo");
			
			expect(mongodb.findOne.called).to.be.true;
		})								
		
	})
});
```


Misc
=========
Other than approaches mentioned above, there are many tools helpful in context of node.js and javascript.

### Mockery

`Dependency Injection` is always the good to make it easy to swap dependencies for flexible and testable design. But sometimes we just want some handy helper to swap the modules we `required` so that dependencies can be injected without extra efforts to arrange code.

`Mockey` is a library for that purpose, it intercepts all require calls and set up mocked dependencies for you.

If we have such:

```js
var fs = require('fs');
var path = require('path');
class FileLogger{
	getLogPath(user_input_path){
		var stat = yield fs.stat(user_input_path);
		if(stat.isDirectory()){
			return path.join(user_input_path,"server.log")
		}else{
			return path;
		}
	}
}
``` 

So the test can be:

```js
describe("FileChecker", function(){
	it("should return a path with 'server.log' if user input is a directory", function(){		
		var fsMock = {
    		stat: function (path) { 
				return {
					isDirectory:function(){return false;}
				};
			 }
		};
		mockery.registerMock('fs', fsMock);
		mockery.enable();
		var logger = new FileLogger();
		var res = logger.getLogPath("/foo/bar");
		
		expect(res).to.be("/foo/bar/server.log");
		mockery.disable();		
	})
});
```

### Mocky, Nock

Specially for external services with REST API, there are some handy tools for testing with controlled response.

##### Mocky
http://www.mocky.io/ gives you fixed response with static url.

##### Nock

Nock intercepts runtime just like Mockery, but dedicated for http calls.
```js
describe("ServiceClient", function(){
	it("should retry 5 times if server returns retryable flag", function(){		
		nock('http://myapp.com')
                .get('/')
                .reply(500, {
                  	retryable: true
                });
				
		var client = new ServiceClient();
		var counter = 0;
		client.on('retry', function(){
			counter++;
		});
		
		try{
			yield client.connect();
		}catch(e){}
		
		expect(counter).to.be(5);
	})
});
```


Conclusion
===============
* Rule #1: your code should be test friendly, otherwise all tools can not be easily applied to it.
* Test what you really and only care.
* Pick the rigth tool and technique to help you, every tool or approach has its good and bad.
* Balance code quality and effort for testing. 
