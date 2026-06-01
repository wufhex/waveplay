export const Compiler = {
    compile(formulaStr, onError, onSuccess) {
        try {
            let code = formulaStr.trim();

            // XSS Guard Layer
            const codeWithoutComments = code
                .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
                .replace(/\/\/.*$/gm, "");        // single-line comments

            const xssFilter = /\b(window|document|fetch|xmlhttprequest|eval|alert|prompt|confirm|cookie|storage|location|websocket|worker|import|require|globalthis|top|parent|frames|self|constructor|prototype|__proto__)\b/i;
            if (xssFilter.test(codeWithoutComments)) {
                throw new Error("XSS Detected.");
            }

            const mathScope = `const { sin, cos, tan, asin, acos, atan, atan2, sinh, cosh, tanh, floor, ceil, round, trunc, abs, max, min, pow, sqrt, cbrt, exp, log, log2, log10, sign, random, PI, E } = Math;\nlet out = 0;`;
            
            // Named virtual file source pointer helps browsers generate stacks for Syntax Errors
            const sourceMapUrl = "\n//# sourceURL=formula.js";

            let compiled = null;

            // Attempt compilation as a single comma-chained expression block
            try {
                let expressionCode = code.replace(/[,;]+$/, ''); 
                compiled = new Function('t', `${mathScope}\nreturn (${expressionCode});${sourceMapUrl}`);
                compiled(0); 
            } 
            // Fallback to statement parsing
            catch (e) {
                let lines = code.split('\n');
                let lastLineIdx = -1;

                for (let i = lines.length - 1; i >= 0; i--) {
                    if (lines[i].trim() !== '') {
                        lastLineIdx = i;
                        break;
                    }
                }

                if (lastLineIdx !== -1) {
                    let lastLine = lines[lastLineIdx].trim();
                    
                    if (lastLine.endsWith(';') || lastLine.endsWith(',')) {
                        lastLine = lastLine.slice(0, -1).trim();
                    }

                    for (let i = lastLineIdx - 1; i >= 0; i--) {
                        if (lines[i].trim() !== '') {
                            let prevLine = lines[i].trim();
                            if (prevLine.endsWith(',')) {
                                lines[i] = lines[i].slice(0, lines[i].lastIndexOf(',')) + ';';
                            }
                            break;
                        }
                    }

                    const outRegex = /^\s*out\s*=\s*(.*)$/;
                    if (outRegex.test(lastLine)) {
                        lastLine = lastLine.replace(outRegex, 'return $1');
                    } else if (!/\breturn\b/.test(lastLine) && !/(?<![=!<>-])=(?![=<>])/.test(lastLine)) {
                        lastLine = `return ${lastLine}`;
                    }

                    lines[lastLineIdx] = lastLine + ';';
                    code = lines.join('\n');
                }

                compiled = new Function('t', `${mathScope}\n${code}${sourceMapUrl}`);
                compiled(0); 
            }

            if (onSuccess) onSuccess();
            return compiled;
        } catch (err) {
            if (onError) {
                let errLine = null;
                let errCol = null;

                if (err.stack) {
                    // This regex checks for both our mapped virtual script file 
                    const match = err.stack.match(/(?:formula\.js|anonymous|Function):(\d+):(\d+)/);
                    if (match) {
                        errLine = parseInt(match[1], 10);
                        errCol = parseInt(match[2], 10);
                    }
                }

                // If regex failed, fall back to browser-specific properties (Firefox/Safari)
                if (errLine === null && err.lineNumber !== undefined) {
                    errLine = err.lineNumber;
                    errCol = err.columnNumber || 1;
                }

                if (errLine !== null) {
                    // mathScope template injects 2 metadata lines before user code
                    const wrapperLineOffset = 2; 
                    errLine = Math.max(1, errLine - wrapperLineOffset);

                    err.formattedMessage = `Error in line ${errLine}, char ${errCol}: ${err.message}`;
                } else {
                    err.formattedMessage = err.message;
                }
                
                onError(err);
            }
            return null;
        }
    }
};