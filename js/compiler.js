export const Compiler = {
    compile(formulaStr, onError, onSuccess) {
        try {
            let code = formulaStr.trim();

            // XSS Guard Layer
            const xssFilter = /\b(window|document|fetch|xmlhttprequest|eval|alert|prompt|confirm|cookie|storage|location|websocket|worker|import|require|globalthis|top|parent|frames|self|constructor|prototype|__proto__)\b/i;
            if (xssFilter.test(code)) {
                throw new Error("XSS Detected.");
            }

            const mathScope = `
                const { sin, cos, tan, asin, acos, atan, atan2, sinh, cosh, tanh, floor, ceil, round, trunc, abs, max, min, pow, sqrt, cbrt, exp, log, log2, log10, sign, random, PI, E } = Math;
                let out = 0;
            `;

            let compiled = null;

            // Attempt compilation as a single comma-chained expression block
            try {
                let expressionCode = code.replace(/[,;]+$/, ''); // Strip terminal punctuation
                compiled = new Function('t', `${mathScope}\nreturn (${expressionCode});`);
                compiled(0); // execute 
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

                    // Fix any trailing commas on the preceding active statement line
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

                compiled = new Function('t', `${mathScope}\n${code}`);
                compiled(0); // execute
            }

            if (onSuccess) onSuccess();
            return compiled;
        } catch (err) {
            if (onError) onError(err);
            return null;
        }
    }
};