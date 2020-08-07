/* Custom 'BS25' ranking function. BS25 is based off the popular 'BM25' ranking function,
 * yet is designed to work with similarity functions like 'dice' or 'jaccard' */

class BS25 {

  constructor(simFunc) {
    this.simFunc = simFunc
    this.terms = []
    this.avgSims = []
    this.avgLen = 0
    this.k1 = null
    this.b = null
    this.numDocs = 0
    this.documents = {}
    this.configDefined = false
    this.consolidated = false

  }

  defineConfig(cfg) {
    if (!cfg['bs25Params'] || !cfg['terms'])
      throw Error("BS25: Both parameters and search terms must defined when calling config")
    if (typeof cfg['terms'] !== 'object' || cfg['terms'].some(term => typeof term !== 'string')) 
      throw Error("BS25: config.terms must be an array of strings. ")
    this.k1 = cfg['bs25Params']['k1'] || 0.5
    this.b = cfg['bs25Params']['b'] ? cfg['bs25Params']['b'] : 0

    this.terms = cfg['terms']

    this.avgSims = this.terms.map(_ => 0)
    this.configDefined = true
  }

  addDoc(doc, id) {
    if (!this.configDefined)
      throw Error("BS25: Config must be defined before adding documents!")
    if (this.consolidated)
      throw Error("BS25: documents cannot be added post-consolidation!")
    
    if (typeof this.documents[id] !== 'undefined')
      throw Error(`BS25: ID '${id}' is already linked to previous document. All documents must have unique IDs.`)
    if (typeof id !== 'string' || typeof doc !== 'string') {
      throw Error(`BS25: Both ID and Document must be strings, received ${typeof id} and ${typeof doc} respectively`)
    }
    
    this.documents[id] = {'sims': [], 'len': 0}
    var simValue = 0
    for (let i = 0; i < this.terms.length; i++) {
      simValue = this.simFunc(doc, this.terms[i])
      this.documents[id]['sims'].push(simValue)
      this.documents[id]['len'] = doc.length
      this.documents[id]['word'] = doc
      this.avgSims[i] += simValue
    }

    this.avgLen += doc.length
    this.numDocs++

  }

  consolidate() {
    this.avgSims = this.avgSims.map(sim => sim / this.numDocs)
    this.avgLen /= this.numDocs

    this.consolidated = true
  }

  query(limit) {
    var num;
    var denom;
    var results = [];
    var sum = 0
    
    limit = Math.max((Math.floor(limit) || 10), 1)
    this.idfs = this.avgSims.map(sim => Math.log(1 / (sim + 10e-5)) + 1)

    for (let key of Object.keys(this.documents)) {
      sum = 0
      for (let [i, sim] of this.documents[key]['sims'].entries()) {
        num = this.idfs[i] * (this.k1 + 1) * sim
        denom = (sim + this.k1 * (1 - this.b + this.b * this.documents[key]['len'] / this.avgLen))
        sum += num / denom
      }
      results.push([key, sum, this.documents[key]['word']])
    }

    results = results.sort((a, b) => b[1] - a[1])

    // console.log(results)

    // console.log(results, this.terms);

    return results.slice(0, limit)
  }

  reset() {
    this.terms = []
    this.avgSims = []
    this.avgLen = 0
    this.k = null
    this.b = null
    this.numDocs = 0
    this.documents = {}
    this.configDefined = false
    this.consolidated = false
  }

}

module.exports = BS25;