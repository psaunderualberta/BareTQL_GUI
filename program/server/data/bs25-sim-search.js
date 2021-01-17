/* Custom 'BS25' ranking function. BS25 is based off the popular 'BM25' ranking function,
 * yet is designed to work with similarity functions like 'dice' or 'jaccard' */

class BS25 {

  constructor(simFunc) {
    /* Similarity function used to rank the documents */
    this.simFunc = simFunc
    /* List of search terms */
    this.terms = []
    /* Average similarity scores to be used with idf */
    this.avgSims = []
    /* Average length of a document */
    this.avgLen = 0

    /* Config parameters */
    this.k1 = null
    this.b = null

    /* # of documents */
    this.numDocs = 0
    /* actual documents, consisting of an identifier and the document itself */
    this.documents = {}

    /* vars to ensure correct sequence of function calls is followed */
    this.configDefined = false
    this.consolidated = false

  }

  defineConfig(cfg) {
    /* Defines the configuration of the ranking function, including the search items and the 
     * parameters for the query itself.
     * 
     * Arguments:
     * - cfg: An object consisting of the fields 'terms', 'bs25Params'
     *    - terms: Array of search terms, each of them strings
     *    - bs25Params: params of the search, including 'k1', and 'b'
     * 
     * Returns:
     * undefined */

    /* Check that 'cfg' is correct */
    if (!cfg['bs25Params'] || !cfg['terms'])
      throw Error("BS25: Both parameters and search terms must defined when calling config")
    if (typeof cfg['terms'] !== 'object' || cfg['terms'].some(term => typeof term !== 'string')) 
      throw Error("BS25: config.terms must be an array of strings. ")

    /* Set search parameters */
    this.k1 = cfg['bs25Params']['k1'] || 0.5
    this.b = cfg['bs25Params']['b'] ? cfg['bs25Params']['b'] : 0

    /* Set other variables */
    this.terms = cfg['terms']
    this.avgSims = this.terms.map(_ => 0)

    /* Config is completed */
    this.configDefined = true

    return
  }

  addDoc(doc, id) {
    /* Adds a document to the engine, calculates the similarity score with the
     * terms entered in 'defineConfig' and saves them.
     * 
     * Arguments:
     * - doc: The actual document that is being queried in the database
     * - id: A unique identifier for the document, to cut down on storage space needed 
     * 
     * Returns:
     * undefined */

    /* Ensure 'addDoc' is called at correct time and with correct parameters */
    if (!this.configDefined)
      throw Error("BS25: Config must be defined before adding documents!")
    if (this.consolidated)
      throw Error("BS25: documents cannot be added post-consolidation!")
    
    if (typeof this.documents[id] !== 'undefined')
      throw Error(`BS25: ID '${id}' is already linked to previous document. All documents must have unique IDs.`)
    if (typeof id !== 'string' || typeof doc !== 'string') {
      throw Error(`BS25: Both ID and Document must be strings, received ${typeof id} and ${typeof doc} respectively`)
    }
    
    /* Set new document, calculate similarity scores */
    if (!this.documents[doc]) {
      this.documents[doc] = {'ids': [], 'sims': [], 'len': 0}
      var simValue = 0
      for (let i = 0; i < this.terms.length; i++) {
        simValue = this.simFunc(doc, this.terms[i])
        this.documents[doc]['sims'].push(simValue)
        this.avgSims[i] += simValue
      }
      this.documents[doc]['len'] = doc.length
    }
    
    this.documents[doc]['ids'].push(id)

    /* Increment counters */
    this.avgLen += doc.length
    this.numDocs++

    return

  }

  consolidate() {
    /* Tells the engine that all documents for the query are added, and to calculate the
     * necessary information from all documents including # added
     * 
     * Arguments:
     * None
     * 
     * Returns:
     * undefined */

     /* Calculate average similarity scores & average length of documents */
    this.avgSims = this.avgSims.map(sim => sim / this.numDocs)
    this.avgLen /= this.numDocs

    /* Set current state of engine */
    this.consolidated = true

    return
  }

  query(limit) {
    /* Perform the query based on the similarity scores previously acquired.
     * 
     * Arguments:
     * - limit: The # of documents to be returned by the query. Defaults to 10
     * 
     * Returns:
     * - The top 'limit' rows from the ranking */

    /* Initialize variables */
    var num;
    var denom;
    var results = [];
    var sum = 0
    
    limit = Math.max((Math.floor(limit) || 10), 1)
    this.idfs = this.avgSims.map(sim => Math.log(1 / (sim + 10e-5)) + 1)

    /* Perform the function to calculate the scores of each 
     * document using the BS25 scoring method */
    for (let key of Object.keys(this.documents)) {
      sum = 0
      for (let [i, sim] of this.documents[key]['sims'].entries()) {
        num = this.idfs[i] * (this.k1 + 1) * sim
        denom = (sim + this.k1 * (1 - this.b + this.b * this.documents[key]['len'] / this.avgLen))
        sum += num / denom
      }
      results.push([this.documents[key]['ids'], sum, key])
    }

    /* Sort the results in descending order */
    results = results.sort((a, b) => b[1] - a[1])

    /* return first 'limit' documents */
    return results.slice(0, limit)
  }

  reset() {
    /* Resets all the parameters except the similarity function */
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