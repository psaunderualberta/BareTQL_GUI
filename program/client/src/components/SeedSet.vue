<template>
    <div id="seed-set">
        <div class="separate-components centering" style="margin-bottom: 1%; ">
            <Logo />


        </div>
        <div class="separate-components centering">            
            <Instruction ref="instruction-1" index="1" style="padding-bottom: 1%;">
                <template #hidden>
                    <p>
                        Welcome to BareTQL! BareTQL is a tool which provides a GUI search through our database of wikipedia tables. <br>
                        There are two parts to the tool: the screen you are looking at right now is the first screen, where keyword searching occurs.
                    </p>
                </template>
            </Instruction>
            <button @click="showInstructions">Click me to learn how to use BareTQL!</button>

            <Instruction ref="instruction-2" index="2" style="padding-bottom: 1%;">

                <template #hidden>
                    <p>
                        <br>
                        This is where you can enter keywords to search for in the database!<br>
                        Separate individual keywords by a comma, and watch the results flow!
                    </p>
                </template>
            </Instruction>
            <!-- Form to submit keyword queries -->
            <form v-on:submit.prevent="submitQuery">
                <p v-if="errors.length">
                    <strong>
                        Please enter at least one keyword
                    </strong>
                </p>
                <div class="inputField">
                    <input type="text" id="keywords" 
                        placeholder="Enter keyword(s)">
                </div>
                <br>
                <div class="inputField">
                    <button type="submit" id="submit-query-button">Submit Query</button>
                </div>
            </form>
        </div>


        <!-- LHS of Page -->
        <div class="page">
            <div class="separate-components">
                <div class="centering">
                    <Instruction ref="instruction-3" index="3">
                        <template #shown>
                            <h4>Results</h4>
                        </template>
                        
                        <template #hidden>
                            <p>
                                This the the 'Results' tab, where the results of your query will be shown.
                            </p>
                        </template>
                    </Instruction>


                </div>

                <!-- List of tables for results -->
                <ul v-if="Object.keys(results).length > 0">

                    <!-- Summary of results -->
                    <p class="centering">
                        There are {{ Object.keys(results).length }} table(s) matching the keywords '{{ keywords }}'.<br>
                        Click on a title to view the table's rows.
                    </p>

                    <!-- Display for query results -->
                    <form>
                        <li v-for="(table, table_rank, index) in results" :key="index" class="top-most-li">
                            <!-- Row title, clicking on title reveals rows of table -->
                            <!-- /* https://codepen.io/Idered/pen/AeBgF */ -->
                            <input type="checkbox" class="read-more-state" :id="'_'+table_rank">
                            
                            <label class="read-more-trigger" :for="'_'+table_rank" style="cursor: pointer;"
                                v-html="'List of '
                                        + makeKeywordsBold(table['title'], keywords) 
                                        + ': ('
                                        + Object.keys(results[table_rank]['rows']).length
                                        + (Object.keys(results[table_rank]['rows']).length > 1 ? ' matches from  ' : ' match from ')
                                        + results[table_rank]['rowCount']
                                        + ' rows)'">
                            </label>
                                
                            <!-- Rows of table -->
                            <div class="read-more-wrap">
                               <p v-for="(rowContent, rowID) in table['rows']" :key="rowID" class="read-more-target">
                                    <input type="checkbox" :id="table_rank+'-'+rowID" 
                                            :value="logRowInfo(rowContent, rowID, table['table_id'])" v-model="selectedRows">
                                    <label :for="table_rank+'-'+rowID"
                                        v-html="'('
                                                + makeKeywordsBold(rowContent, keywords)
                                                + ')'">
                                    </label>
                                </p> 
                            </div>
                        </li>
                    </form>
                </ul>
                <!-- Only upon initialization of page -->
                <p v-else-if="typeof results === 'string'" class='centering'> 
                    Enter keywords and see the rows in our database which match!
                </p>
                <p v-else class="centering">
                    No results for the previous query.
                </p>
            </div>
        </div>

        <!-- RHS of Webpage -->
        <div class="page">

            <!-- Display for selected seed set rows -->
            <div class="separate-components centering">
                <Instruction ref="instruction-4" index="4">
                    <template #shown>
                        <h3>Seed Set</h3>
                    </template>

                    <template #hidden>
                        <p>This is where a preview of your seed set will be displayed</p>
                    </template>

                    <template #button-text>
                        End Tutorial
                    </template>

                </Instruction>
                <p v-if="table['numRows'] === 0">
                    No seed set rows have been selected
                </p>
                <div v-else>

                    <!-- Table content -->
                    <UserTable :table="table['rows']" :allowSelection="false"/>
                    <button @click="postSeedSet">Use as Seed Set</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import Logo from './Logo.vue'
import ResultService from '../getResults.js'
import UserTable from './UserTable.vue'
import Instruction from './Instruction.vue'

export default {
    name: 'SeedSet',
    components: {
        Logo,
        UserTable,
        Instruction,
    },

    data: function() {
        return {
            keywords: '',
            results: "",
            errors: [],
            selectedRows: [],
            document: document,  
        }
    },

    methods: {

        async showInstructions() {
            var inputButtons = this.document.querySelectorAll("button:not(.instruction-button), input, labels")

            for (let inp of Object.values(inputButtons)) {inp.disabled = true; inp.classList.toggle('deactivate')}

            for (let i = 1; i < document.querySelectorAll('.instruction-component').length + 1; i++) {
                await this.$refs[`instruction-${i}`].handleClick();
            }

            for (let inp of Object.values(inputButtons)) {inp.disabled = false; inp.classList.toggle('deactivate')}
        },

        /* Use single button in corner as measure of when to increment i */

        submitQuery() {
            /* Submits the keyword query to the backend,
             * assigns the result of the query (after formatting)
             * to the 'results' data
             */
            var changeButton = function(button, content, state, opacity) {
                button.textContent = content;
                button.disabled = state;
                button.style.opacity = opacity;
            }

            this.errors = [];
            this.selectedRows = [];
            var keywords = this.document.querySelector('#keywords').value // Only update keywords here, not on change
            var submitButton = this.document.querySelector('#submit-query-button')

            // https://vuejs.org/v2/cookbook/form-validation.html
            if (keywords.length > 0) {
                changeButton(submitButton, "Loading...", true, 0.5);
                ResultService.getKeywords(keywords)

                .then((data) => {
                    changeButton(submitButton, "Submit Query", false, 1);
                    this.results = data
                    this.keywords = keywords

                }).catch((err) => {
                    changeButton(submitButton, err, false, 1);
                    console.log(err);
                })     
            } else {
                if (this.keywords.length === 0) {
                    this.errors.push(0); // Need at least one item, doesn't matter what
                }

            }
        },

        postSeedSet() {
            /* Set the seed set attribute on the back-end,
             * emit event to change the page's mode
             */
            var tableIDs = [];
            var rowIDs = [];
            this.selectedRows.forEach(row => {
                tableIDs.push(row['tableID'])
                rowIDs.push(row['rowID'])
            });

            ResultService.postSeedSet(rowIDs, tableIDs)
            .then(() => {
                this.$emit('ChangeMode')
            })
            .catch((err) => {
                console.log(err);
            })
        },

        logRowInfo(rowContent, rowID, table_id) {
            /* Formats the data to be passed to 'selectedRows' */
            return {
                rowContent: rowContent.split(/ *\|\| */),
                rowID: rowID,
                tableID: table_id,
            }
        },

        makeKeywordsBold (str, keywords) {
            /* Make all keywords appear bold in result
             * TODO: 'this' refers methods (dunno why), so we pass the keywords by value 
             * https://x-team.com/blog/highlight-text-vue-regex/
             * Accessed June 9th, 2020
             */

            return str.replace(new RegExp(keywords.split(/ *, */).join('|'), 'gi'), match => {
                return '<strong>' + match + '</strong>'
            })
        },

    },

    computed: {
        table: function() {
            /* Computes the seed-set table from this.selectedRows */
            var rows = [];
            var numRows = 0;
            var numCols = 1;
            this.selectedRows.forEach(row => {
                row = row['rowContent']
                numCols = Math.max(row.length, numCols);
                numRows += 1
                rows.push(row);
            });

            return {
                rows: rows,
                numRows: numRows,
                numCols: numCols,
            }
        },
    }
}

</script>


<style scoped>

input {
    cursor: pointer;
}

input[type='text'] {
    border: 5px solid white;
    height: 100%;
    width: 30%;
}

.top-most-li {
    margin: 1%;
}

.inputField {
    margin: 1px;
}

/* https://codepen.io/Idered/pen/AeBgF */
.read-more-state {
  display: none;
}

.read-more-target {
  opacity: 0;
  max-height: 0;
  font-size: 0;
  transition: .25s ease;
}

.read-more-state:checked ~ .read-more-wrap .read-more-target {
  opacity: 1;
  font-size: inherit;
  max-height: 999em;
}

.read-more-trigger {
  cursor: pointer;
  display: inline-block;
  padding: 0 .5em;
  color: #80C080;
  font-size: 0.95em;
  line-height: 2;
  border: 1px solid #ddd;
  border-radius: .25em;
  background: rgb(49, 45, 45);
  margin: 0.1em 0;
}

</style>