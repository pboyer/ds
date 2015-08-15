import visitor = require('./visitor');
import ast = require('./ast');
import enviro = require('./environment');
import imperative = require('./imperative');
import replicator = require('./replicator');
import range = require('./range');
import types = require('./types');

export class DependencyNode {
    private static gid : number = 0;
    
    id : number = DependencyNode.gid++;
    dirty : boolean = true;
    inputs : DependencyNode[] = [];
    outputs : DependencyNode[] = [];
    value : any = null;    
    f : (...any : any[]) => any;

    constructor( f : (...any : any[]) => any ){
        this.f = f;
    }
    
    static constant( val : any ) : DependencyNode {
        return new DependencyNode( () => val ).eval();
    }

    eval() : DependencyNode {
        this.value = this.f.apply(null, this.inputs.map( (x) => x.value ));
        this.dirty = false;
        return this;
    }
}

export class AssociativeInterpreter implements visitor.Visitor<DependencyNode> {

    env : enviro.Environment = new enviro.Environment();
    replicator : replicator.Replicator = new replicator.Replicator();

    run( sl : ast.StatementListNode ) : DependencyNode {
        return sl.accept( this );
    }

    set( id : string, n : DependencyNode | types.TypedFunction ) {
        this.env.set( id, n );
    }

    lookup( id : string ) : DependencyNode | types.TypedFunction {
        return this.env.lookup( id );
    }

    visitNumberNode(node : ast.NumberNode) : DependencyNode { 
        return DependencyNode.constant( node.value ); 
    }
    
    visitBooleanNode(node : ast.BooleanNode) : DependencyNode { 
        return DependencyNode.constant( node.value ); 
    }
    
    visitStringNode(node : ast.StringNode) : DependencyNode { 
        return DependencyNode.constant( node.value ); 
    }
    
    visitStatementListNode(node : ast.StatementListNode) : DependencyNode {
        var n,s,sl = node;
        while (sl){
            s = sl.head;
            if ( !s ) break;
            n = s.accept( this );
            sl = sl.tail;
        } 
        return n;
    }

    visitAssignmentNode(node : ast.AssignmentNode) : DependencyNode {
        var id = node.identifier.name;
        var n = node.expression.accept( this );
       
        if (this.env.contains( id )) {
            throw new Error("You cannot reassign a variable in associative mode!");
            // replace( this.lookup( id ), n ); 
        }
            
        this.set( id, n );
        resolve( n );  

        return n;
    }

    visitIdentifierNode(node : ast.IdentifierNode) : DependencyNode {
        var n : any = this.lookup( node.name );  
        if (!n) {
            throw new Error("Unbound identifier: " + node.name);
        }
        
        if (n instanceof types.TypedFunction) {
            throw new Error("The identifier " + node.name + 
            " is a function and is being used as a value");
        } else if (n instanceof DependencyNode) {
             return n;
        }
        
        throw new Error("The identifier " + node.name + 
        " is of an unknown type!");    
    }

    visitBinaryExpressionNode(node : ast.BinaryExpressionNode) : DependencyNode {
        var n : DependencyNode;

        switch( node.operator ){
            case "+":
                n = new DependencyNode( (a, b) => a + b );
                break;
            case "-":
                n = new DependencyNode( (a, b) => a - b );
                break;
            case "*":
                n = new DependencyNode( (a, b) => a * b );
                break;
            case "<":
                n = new DependencyNode( (a, b) => a < b );
                break;
            case "||":
                n = new DependencyNode( (a, b) => a || b );
                break;
            case "==":
                n = new DependencyNode( (a, b) => a === b );
                break;
            case ">":
                n = new DependencyNode( (a, b) => a > b );
                break;
            default:
                throw new Error( "Unknown binary operator type" );
        }

        connect( node.firstExpression.accept( this ), n, 0 ); 
        connect( node.secondExpression.accept( this ), n, 1 ); 
        
        return n.eval();
    }

    visitArrayIndexNode(node : ast.ArrayIndexNode) : DependencyNode { 
        var n = new DependencyNode((a,i) => a[i]);
        var a = node.array.accept( this );    
        var i = node.index.accept( this ); 
        connect( a, n, 0 );   
        connect( i, n, 1 );
        
        return n.eval();
    }
    
    visitArrayNode(node : ast.ArrayNode) : DependencyNode { 
        var n = new DependencyNode(function(){ return Array.prototype.slice.call(arguments); });
        var el = node.expressionList;
        var i = 0;
        while (el){
            var e = el.head;
            var s = e.accept( this );
            connect( s, n, i++ );
            el = el.tail;
        }
        return n.eval();
    }

    visitImperativeBlockNode(node : ast.ImperativeBlockNode) : DependencyNode { 
        var n = new DependencyNode( () => {
            var i = new imperative.ImperativeInterpreter();
            return i.run(node.statementList);
        });
        return n.eval();
    };
    
    visitAssociativeBlockNode(node : ast.AssociativeBlockNode) : DependencyNode { 
        var n = new DependencyNode( () => {
            var i = new AssociativeInterpreter();
            return i.run(node.statementList).value;
        });
        return n.eval();
    };
    
    visitRangeExpressionNode(node : ast.RangeExpressionNode) : DependencyNode { 
        
        var start = node.start.accept( this );
        var end = node.end.accept( this );
        
        if (!node.step){
            var n = new DependencyNode(range.Range.byStartEnd);
            connect( start, n, 0 );
            connect( end, n, 1 );
            return n.eval();
        }
            
        var step = node.step.accept( this );
        var f = node.isStepCount ? range.Range.byStepCount : range.Range.byStepSize;
        
        var n = new DependencyNode(f);
        connect( start, n, 0 );
        connect( end, n, 1 );
        connect( step, n, 2 );
        
        return n.eval();
    };
    
    apply(fd: ast.FunctionDefinitionNode, env: enviro.Environment, args: any[]): any {
        env = new enviro.Environment(env);

        // bind
        var i = 0;
        var il = fd.arguments;
        while (il != null) {
            env.set(il.head.name, args[i++]);
            il = il.tail;
        };

        var current = this.env;
        this.env = env;

        var r = fd.body.accept(this);

        this.env = current;
        return r;
    }
    
    visitFunctionDefinitionNode(fds : ast.FunctionDefinitionNode) : DependencyNode { 
         
         // unpack the argument list 
        var il = fds.arguments;
        var val = [];
        while (il != undefined) {
            var t = il.head.type;
            val.push(new types.TypedArgument(il.head.name, t ? t.name : undefined ));
            
            il = il.tail;
        }

        var fd;
        var env = this.env;
        var interpreter = this;

        function f() {
            var args = Array.prototype.slice.call(arguments);
            return interpreter.apply(fds, env, args);
        }
        
        env.set(fds.identifier.name, f); // recursion

        fd = new types.TypedFunction(f, val, fds.identifier.name);

        this.set(fds.identifier.name, fd);
        
        return null; 
    }

    visitFunctionCallNode(node : ast.FunctionCallNode) : DependencyNode { 
        var f = this.lookup(node.functionId.name);
        
        if (f instanceof types.TypedFunction){
            var rep = this.replicator;
            var n = new DependencyNode(function(){ return rep.replicate(f, Array.prototype.slice.call(arguments) ); });
            var el = node.arguments;
            var i = 0;
            while (el){
                var e = el.head;
                el = el.tail;
                connect( e.accept(this), n, i++ );
            }
            return n.eval();
        }

        throw new Error(node.functionId.name + " is not a function.");
    }

    visitReplicationExpressionNode(node : ast.ReplicationExpressionNode) : DependencyNode { 
        
        var e = node.expression.accept(this);
        var l = node.replicationGuideList.accept(this);
        var n = new DependencyNode( (e,l) => new types.ReplicatedExpression(e,l) );
        
        connect(e, n, 0);
        connect(e, l, 1);
        
        return n.eval();
    }
   
    visitReplicationGuideListNode(rl: ast.ReplicationGuideListNode): DependencyNode {
        
        var n = new DependencyNode(function(){ return Array.prototype.slice.call(arguments); })
        
        var i = 0;
        while (rl != undefined) {
            connect( rl.head.accept(this), n, i++);
            rl = rl.tail;
        }
        
        return n.eval();
    }
    
    visitReplicationGuideNode(node : ast.ReplicationGuideNode) : DependencyNode { 
        return DependencyNode.constant(node.index);
    }
    
    visitIdentifierListNode(node : ast.IdentifierListNode) : DependencyNode { throw new Error("Not implemented"); }
    visitExpressionListNode(node : ast.ExpressionListNode) : DependencyNode { throw new Error("Not implemented"); }
    visitIfStatementNode(node : ast.IfStatementNode) : DependencyNode { throw new Error("Not implemented"); }

}

function resolve( node : DependencyNode ){
    // mark the nodes
    var marked = new Array<DependencyNode>(), remaining = [ node ];
    while (remaining.length){
        let n = remaining.pop();
        n.dirty = true;
        n.outputs.forEach((x) => remaining.push(x));
        marked.push(n);
    }

    // topo sort
    var roots = marked.filter((x) => x.inputs.reduce((a, y) => !y.dirty && a, true));
    var sorted = new Array<DependencyNode>();        
    var visited = {};

    while( roots.length ){
        let n = roots.pop();
        visited[ n.id ] = n;
        sorted.push( n );

        n.outputs.forEach( (o) => {
            var isRoot = o.inputs.reduce((a, y) => (visited[ y.id ] || !y.dirty) && a, true);
            if (isRoot) roots.push( o );
        });
    }

    // execute the nodes in order
    sorted.forEach((x) => x.eval());
}

function replace( old : DependencyNode, rep : DependencyNode) {
    rep.outputs = old.outputs;
    rep.inputs = old.inputs;

    rep.outputs.forEach((x) => 
            {
                var i = x.inputs.indexOf( old );
                x.inputs[ i ] = rep;
            });

    rep.inputs.forEach((x) =>
            {
                var i = x.outputs.indexOf( old );
                x.outputs.splice(i, 1);
            });
}

function connect( s : DependencyNode, e : DependencyNode, i : number ){
    if (s === e) throw new Error("Cannot connect a node to itself");
    
    s.outputs.push( e );
    e.inputs[i] = s;
}

function disconnect( s : DependencyNode, e : DependencyNode, i : number ){
    var i = s.outputs.indexOf(e)
    s.outputs.splice(i, 1);

    e.inputs[i] = null;
}
