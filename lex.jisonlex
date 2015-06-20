digit                       [0-9]
id                          [a-zA-Z][a-zA-Z0-9]*

%%
"//".*                      /* ignore comment */
"if"                        return 'IF';
"else"                      return 'ELSE';
"def"			    return 'DEF';
"var"			    return 'VAR';
"null"                      return 'NUL';
"true"                      return 'TRUE';
"false"                     return 'FALSE';
"return"                    return 'RETURN';
{digit}+                    return 'LITERAL';
{id}                        return 'ID';
"=="                        return 'EQUALITY';
"="                         return 'ASSIGN';
"+"                         return 'PLUS';
"-"                         return 'MINUS';
"*"                         return 'TIMES';
","                         return 'COMMA';
">"                         return 'GREATER';
"||"                        return 'OR';
"!"                         return 'NOT';
"."                         return 'DOT';
"{"                         return 'LBRACE';
"}"                         return 'RBRACE';
"("                         return 'LPAREN';
")"                         return 'RPAREN';
";"                         return 'SEMICOLON';
\s+                         /* skip whitespace */
"."                         throw 'Illegal character';
<<EOF>>                     return 'ENDOFFILE';


