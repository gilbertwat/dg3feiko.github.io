Bad Practices That Make Code Hard to Test
=======

## Tight Functions

```js

function redirectTo(url) {
	if (url.charAt(0) === "#") {
		window.location.hash = url;
	} else if (url.charAt(0) === "/") {
		window.location.pathname = url;
	} else {
		window.location.href = url;
	}
}

```

#### Why it is bad
The function is tightly coupled with external services or logics so that it will be not easy to concentrate on core logic of its own for testing. Another example is context-aware input:

```js
function(client){
	var res = yield.client.request();
	//complex handling with payload which you want to test
}

//instead of 

function(payload){
	//complex handling with payload which you want to test
}
```

**`The more native (simple) input and output you code has, the more testable it is.`** 


#### How to fix it

Make function's input and output more native and less context-aware.

```js
function _getRedirectPart(url) {
	if (url.charAt(0) === "#") {
		return "hash";
	} else if (url.charAt(0) === "/") {
		return "pathname";
	} else {
		return "href";
	}
}

function redirectTo(url) {
	window.location[_getRedirectPart(url)] = url;
}
And now we can write a simple test suite for _getRedirectPart:

test("_getRedirectPart", function() {
	equal(_getRedirectPart("#foo"), "hash");
	equal(_getRedirectPart("/foo"), "pathname");
	equal(_getRedirectPart("http://foo.com"), "href");
});
```

## Require or Initialize External Services Within Scope Under Tests

```js
var Mongo = require("Mongo");
var Redis = require("Redis");

class DataStore{
	constructor(){
		this.mongo = new Mongo();
		this.redis = new Redis();
	}
	
	//logics
}
```


#### Why it is bad
The cost of set up and control external dependencies is large and not possible in many cases, which leads to inflexible design and difficulties in test cases.

```js
describe("DataStore", function(){
	it("should do something correctly", function(){
		//we can not easily set up test unless we have real replicated infrastructure
		//step 1 start redis
		//step 2 start mongo
		var ds = new DataStore();
		var res = ds.doSomething();
		expect(res).to.be("expected output");
	});
});
```

#### How to fix it
[Dependency Injection](https://en.wikipedia.org/wiki/Dependency_injection)

```js
//constructor injection
class DataStore{
	constructor(mongo, redis){
		this.mongo = mongo
		this.redis = redis
	}	
	//logics
}

//test
describe("DataStore", function(){
	it("should do something correctly", function(){
		//mocked implementation, so that the interaction can be fully controlled
		var mongo = new MockedMongo();
		var redis = new MockedRedis();
		//control input and output of external dependencies
		redis.onCall("foo").returns("bar");
		mongo.onCall("hello").returns("world");
		//inject mocked dependencies
		var ds = new DataStore(mongo, redis);		
		var res = ds.doSomething();
		expect(res).to.be("expected output");
	});
});

```

##  Violating the Law of Demeter

[Law of Demeter](https://en.wikipedia.org/wiki/Law_of_Demeter)

```js
class AddressValidator(){
	constructor(remote_service_client){
		this.remote_service_client = remote_service_client;
	}
	
	validate(){
		var user = yield remote_service_client.getCurrentUser();
		var address = user.getAddress();
		//logics to validate address
	}
}
```

#### Why it is bad
Umlimited scope of dependencies usually introduces a lot unnecessary noise and difficulties to test, as tests need to rebuild the whole object graph the scope just for a small part of it. This kind of violation does not only happen in constructor, but also in function interfaces. 

```js
describe("AddressValidator", function(){
	it("should let good address pass", function(){
		var mock_client = //a bunch of code to mock the whole client
		instruct(mock_client).to.response(/* user with good address*/);
		var validator = new AddressValidator(mock_client);
		expect(validate(mock_client)).to.be(true);
	});
});
```

#### How to fix it  

Require scope of input as small as possible.

```js
class AddressValidator(){
	constructor(){}	
	validate(address){		
		//logics to validate address
	}
}

//test
describe("AddressValidator", function(){
	it("should let good address pass", function(){		
		var validator = new AddressValidator();
		expect(validate("GoodAddress1")).to.be(true);
		expect(validate("GoodAddress2")).to.be(true);
		expect(validate("BadAddress1")).to.be(false);
	});
});

```

## Global Variables, Singletons

```js
class Logger{
	constructor(){		
		this.log_store = FileManager.getStore();//global singleton			 
	}
	//do something with log_store
}
```

#### Why it is bad

* Global virables and singletons are usually hard to be replacable, and lifecycle of global objects is not `aligned` with the object under tests.

```js
describe("Logger", function(){
	it("should stream logs to a file", function(){		
		var logger = new Logger();
		//how can test cases take full control of FileManager in order to perform test ???
	});
});
```

#### How to fix it

Don't use any global variables and singleton inside the scope you want to test. Use dependency injection.

```js
//from
constructor(){		
	this.log_store = FileManager.getStore();			 
}
//to
constructor(log_store){		
	this.log_store = log_store;			 
}

//from
constructor(){}
function log_verbose(msg){
	if(NODE_ENV === "development"){
		console.log(msg)
	}else{
		//do nothing
	}
}

//to
constructor(shouldLogVerbose){ this.shouldLogVerbose = shouldLogVerbose} //the desicion making is moved to centralized external scope, just imagine what if the desicion is based on "NODE_ENV + NODE_OTHER_FLAG" instead of "NODE_ENV" solely?  
function log_verbose(msg){
	if(shouldLogVerbose){
		console.log(msg)
	}		
}
```

## Messy Inheritance

Inheritance is usually for two purposes: code reuse and flow control. But in both case, it is hard for writing tests if no super careful handle is taken.

```js
class CDDrive{
	eject(){};
	inject(){};	
	readOneDisk(){
		this.eject();
		//wait for disk 
		this.inject();							
		//do CD decoding
		return;
	}
} 

//subclassing is for resue part of eject() and inject()
class DVDDrive extends CDDrive{
	readOneDisk(){
		this.eject();
		//wait for disk 
		this.inject();							
		//do DVD decoding
		return;
	}
		
	eject(){
		super();
		blinkRed();
	}
	
	inject(){
		super();
		blinkGreen();
	};	
}
```

```js
describe("DVDDrive", function(){
	it("should be able to read a disk", function(){		
		var drive = new DVDrive();
		//how to mock super.eject and super.inject ???				 
	});
});
```

```js
//subclassing for flow control
class SocialAuthenticator(){
	constructor(encrypted_user_info){
		this.encrypted_user_info = encrypted_user_info;		
	}
	auth(){
		this.user_info = yield this.decrypt(this.encrypted_user_info);
		this.context = yield this.prepareContext(); //bad: sophisticated dependency for subclasses
		
		var token = yield this.realAuth();
		
		if(this.finished){
			yield this.update(user_info, token);
		} else {
			throw new Error("not finish");
		}		
		
		return yield this.redirectToLandingPage();		
	}			
}

class FacebookAuthenticator extends SocialAuthenticator(){
	constructor(config, encrypted_user_info){
		super(encrypted_user_info)
		this.client = new FacebookClient(config);
	}
	realAuth(){
		let info = this.user_info;
		let credential = context.getCredential();		
		var res = yield this.client.auth({credential: credential, info: info});
		if(res.err){
			return null;
		}else{
			return res.data;
		}
		this.finished = true; //bad: use shared variables to communicate		
	}	
}

//test
describe("FacebookAuthenticator", function(){
	it("should return updated info for a valid user", function(){		
		var validator = new FacebookAuthenticator("encrypted_user_info","CONFIG"); //prepare encrypted_user_info is unnecessary and noisy and very hard to mock 
		validator.auth();// wait how can I mock this.prepareContext and make it correct for my cases?		
		
		//and how can I verify the result? as the flow is going to this.redirectToLandingPage						 
	});
});

```

#### Why it is bad
* Inheritance blurs the relation and responsibilities of different class
* Inheritance usually has some shared state communication
* Inheritance usually introduces some noise to set up and get it through.

#### How to fix it

Extract Interfaces and Do Composition

```js

//use self-contained class to wrap functionalities
class MechanicController{
	eject();
	inject();
}

class CDDrive{
	constructor(machanic_controller){
		this.machanic_controller = machanic_controller;
	}	
	readOneDisk(){
		this.machanic_controller.eject();
		//wait for disk 
		this.machanic_controller.inject();							
		//do CD decoding
		return;
	}
} 

class DVDDrive {
	constructor(machanic_controller, lightning_controller){
		this.machanic_controller = machanic_controller;
		this.lightning_controller = lightning_controller;
	}
	readOneDisk(){
		this.machanic_controller.eject();
		this.lightning_controller.blinkRed();
		//wait for disk 
		this.machanic_controller.inject();
		this.lightning_controller.blinkGreen();							
		//do DVD decoding
		return;
	}					
}

//test
describe("DVDDrive", function(){
	it("should be able to read a disk", function(){
		var mock_machanic_controller = {
			//mocking impl
		}
		
		var mock_lightning_controller = {
			//mocking impl
		}			
		var drive = new DVDrive(mock_machanic_controller, mock_lightning_controller);		
		var res = drive.readOneDisk();
		
		//assertion here	 
	});
});

```

```js
class SocialAuthenticator(){
	constructor(encrypted_user_info, social_auth_client){
		this.encrypted_user_info = encrypted_user_info;
		this.social_auth_client = social_auth_client; //this is an interface for all implementation for different social network, which has one method: doAuth = (user, credential) => {isValid , user_token, err}		
	}
	auth(){
		this.user_info = yield this.decrypt(this.encrypted_user_info);
		this.context = yield this.prepareContext();
		
		let credential = context.getCredential();		
		var res = yield this.social_auth_client.doAuth({credential: credential, user: user});
		
		if(res.isValid){
			yield this.update(user_info, res.token);
		}else{
			throw new Error("not valid");
		}
		
		return yield this.redirectToLandingPage();				
	}			
}

class FacebookAuthenticator extends SocialAuthenticator(){
	constructor(config){		
		this.client = new FacebookClient(config);
	}
	
	doAuth(credential, user){					
		var res = yield this.client.auth({api_key:credential.api_key, info: user});
		if(res.err){
			return {isValid:false, err: res.err};
		}else{
			return {isValid:false, token: res.data.token};
		}				
	}	
}

//test
describe("FacebookAuthenticator", function(){
	it("should return updated info for a valid user", function(){		
		var validator = new FacebookAuthenticator("CONFIG"); 
		
		//now you can focus on your Facebook impl without any noisy and extra set up
		
		expect(yield validator.doAuth({credential:"Bad credential"}, user:{id:"", token:""}).to.has("err").euqals("Invalid credential");
		
		expect(yield validator.doAuth({credential:"Good credential"}, user:{id:"Good id", token:"good token"}).to.has("isValid").equals(true);						 
	});
});
```



Bad Practices That Make Tests Ineffient
=========================

## Just Reflect The Implementation

```js
//code
class MyClass{
	function calulate(i){
		return (i < 0) ? i * -1 : i
	}
}

//test
describe("MyClass", function(){
	it("shoul do correct things", function(){
		var instance = new MyClass()
		var num = Math.random();
		expect(instance.calulate(num)).to.be((num < 0) ? num * -1 : num)
	})
})
```

#### Why it is bad
That test is clearly not useful: it contains an exact copy of the code under test and acts like a checksum. Once the implementation changed, test cases need to be changed as well.

#### How to fix it
Test on behaviours.

```js
describe("MyClass", function(){
	it("should return absolute value of input", function(){
		var instance = new MyClass()		
		expect(instance.calulate(1)).to.be(1);
		expect(instance.calulate(-1)).to.be(1);
		expect(instance.calulate(0)).to.be(0);
		expect(instance.calulate(-2)).to.be(2);
	})
})
```

## Write code only for tests

```js
class CallBlocker{
	constructor(user){
		this.user = user;
	}
	init(){ // this part make test hard to write
		Server.readConfig();
		let server = Server.getInstance();
		this.calls = server.getCallsForUser(this.user); 
	}
	
	setCalls(calls){//so we make this to make it possible to mock calls
		this.calls = calls;
	}		
}

//test
describe("CallBlocker", function(){
	it("should block malicious calls", function(){		
		var user = new RealUser(user_info);
		var blocker = new CallBlocker(user);
		yield blocker.init();//complex and wasting time on it
		blocker.setCalls(new MockCalls());// see ! I can mock it eventually
		//assertion		
	});
});
```

#### Why it is bad
This is just one of those tricks which adding lines to code just for tests. Usualy those tricks do not respect the normal flow of the internal state transitions of objects and can not fix the root cause of low testability of the object design. As well they leak unexpected access to public use.

#### How to fix it
Redesign the object graph and make it generally testable.


##Test Implementation rather than Interface

```js
class Calulator(){
	vectorAdd(arr1, arr2){ 
		return arr1.map(function(num1, index){ return num1 + arr2[index]; })
	}
	
	add(a, b){
		return a + b;
	}
}

//test
describe("Calulator", function(){
	it("should do scalar add correctly", function(){		
		var cal = new Calulator();
		expect(cal.add(1,1)).to.be(2);
		expect(cal.add(1,2)).to.be(3);
	});
});
```

#### Why it is bad
Interfaces are assumed to be stable while implementations are flexible and changing over time. In above example, if we change the implementation to a GPU accelerated one, the `add()` tests must be deprecated and wasted. Testing on interfaces can make test cases stable as well. But in some cases, the actually implmentation is too complicated to cover by interface tests, then you may consider add test cases for it even in the cost of low flexibility. e.g. :   

```js
class Encrytor(){
	complicatedLogic(){
		
	}
	encrypt(input){
		//some pre manipulation
		complicatedLogic();
		//some post manipulation
	}
	decrypt(output){
		//some pre manipulation
		complicatedLogic();
		//some post manipulation
	}
}

//you want to ensure the complicated logic, so you add unit tests like
describe("Encrytor", function(){
	it("complicatedLogic should be correct", function(){		
		var enc = new Encrytor();
		expect(enc.complicatedLogic("input1")).to.be("output1");
		expect(enc.complicatedLogic("input2")).to.be("output2");				
	});
});

```

#### How to fix it
Test on interfaces.

```js
describe("Calulator", function(){
	it("should do vector add correctly", function(){		
		var cal = new Calulator();
		expect(cal.vectorAdd([1,1],[1,2])).to.be([2,2]);
		expect(cal.vectorAdd([1,2],[3,4])).to.be([4,6]);
	});
});

```
