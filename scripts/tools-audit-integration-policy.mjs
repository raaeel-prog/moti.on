/** Three-way hash decision: never replay an unchanged audit file over newer work. */
export function integrationDecision({source, target, baseline, integrated, imported, accepted=[]}){
 if(source===baseline)return 'baseline';
 if(source===target)return 'already-integrated';
 if(integrated!==undefined && source===integrated)return 'preserve-concurrent';
 if(imported!==undefined && source===imported)return 'preserve-concurrent';
 if(target===baseline || imported!==undefined && target===imported || accepted.includes(target))return 'write';
 return 'conflict';
}
