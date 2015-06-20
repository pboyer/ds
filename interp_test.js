var Parser = require('./parse')
	, assert = require('assert')
	, Interpreter = require('./interp').Interpreter;

var ast = require('./ast');
Parser.parser.yy = ast;

function eval(p){
	var pp = Parser.parse( p );

	// record the debug statements
	var record = [];
	var exts = {
		"debug" : function(x){ record.push(x) }
	};

	(new Interpreter( exts )).eval( pp );
	
	return record;
}

(function(){
	var r = eval('var a = 4; debug(a);');
	assert.equal( 4, r[0] ); 	
})();

(function(){
	var r = eval('def foo(a,b){ return a + b; }; debug( foo(1, 2) );');
	assert.equal( 3, r[0] );
})();

(function(){
	var r = eval('def foo(a,b){ return bar(a,b); }; def bar(a,b){ return a + b; }; debug( foo(1, 2));');
	assert.equal( 3, r[0] );
})();

(function(){
	var r = eval('def intId(a : int){ return a; }; debug( intId(2) );');
	assert.equal( 2, r[0] );
})();


