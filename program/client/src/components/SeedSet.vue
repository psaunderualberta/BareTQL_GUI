<template>
  <div id="seed-set">
    <div class="centering" style="margin-bottom: 1%; ">
      <Logo/>
    </div>
    <hr>
    <div class="centering">
      
      <!-- Form to submit keyword queries -->
      <form v-on:submit.prevent="submitQuery" style="padding-top: 1%;">
        <p v-if="errors.length">
          <strong>Please enter at least one keyword</strong>
        </p>
        <div class="inputField">
          <input type="text" id="keywords" placeholder="Enter keyword(s)" />
        </div>
        <br />
        <div class="inputField">
          <button type="submit" id="submit-query-button">Submit Query</button>
        </div>
      </form>
    </div>

    <div style="display: flex;">
      <!-- LHS of Page -->
      <div class="page">
        <div class="separate-components">
          <div class="centering">
            <h3>Results</h3>
          </div>

          <!-- List of tables for results -->
          <ul v-if="Object.keys(results).length > 0">
            <!-- Summary of results -->
            <p v-if="Object.keys(results).length === 20" class="centering">
              These are the top 20 tables that match the keywords '{{ keywords }}'.
              <br />Click on a title to view the table's rows.
            </p>
            <p v-else class="centering">
              There are {{ Object.keys(results).length }} table(s) matching the keywords '{{ keywords }}'.
              <br />Click on a title to view the table's rows.
            </p>

            <!-- Display for query results -->
            <form style="font-size: 0.9em;">
              <li v-for="(table, table_rank, index) in results" :key="index" class="top-most-li">
                <!-- Row title, clicking on title reveals rows of table
                https://codepen.io/Idered/pen/AeBgF */-->
                <input
                  type="checkbox"
                  class="read-more-state"
                  :id="'_'+table_rank"
                  :value="table_rank"
                  v-model="clickedTables"
                />

                <label class="read-more-trigger" :for="'_'+table_rank">
                  <span v-html="makeKeywordsBold(table['title'], keywords)"></span>
                  :
                  ({{ Object.keys(results[table_rank]['rows']).length }}
                  {{ Object.keys(results[table_rank]['rows']).length > 1 ? ' matches from ' : ' match from ' }}
                  {{ results[table_rank]['rowCount'] }} rows)
                  <span
                    v-if="isTableInSS(table['table_id'])"
                  >***</span>
                </label>

                <!-- Rows of table -->
                <transition name="table">
                  <div v-if="isTableChecked(table_rank)">
                    <p
                      v-for="(rowContent, rowID) in table['rows']"
                      :key="rowID"
                      class="read-more-target"
                    >
                      <input
                        type="checkbox"
                        :id="table_rank+'-'+rowID"
                        :value="logRowInfo(rowContent, rowID, table['table_id'], table['title'])"
                        v-model="selectedRows"
                      />
                      <label
                        :for="table_rank+'-'+rowID"
                        v-html="'('
                                 + makeKeywordsBold(rowContent, keywords)
                                 + ')'"
                      ></label>
                    </p>
                  </div>
                </transition>
              </li>
            </form>
          </ul>
          <!-- Only upon initialization of page -->
          <p
            v-else-if="typeof results === 'string'"
            class="centering"
          >Enter keywords and see the rows in your database which match!</p>
          <p v-else class="centering">No results for the previous query.</p>
        </div>
      </div>

      <!-- RHS of Webpage -->
      <div class="page">
        <div class="sticky">
          <!-- Display for selected seed set rows -->
          <div class="separate-components centering">
            <h3>Seed Set</h3>
            <p v-if="table['numRows'] === 0">No seed set rows have been selected</p>
            <div v-else>
              <!-- Table content -->
              <div class="no-overflow">
                <UserTable :table="table" />
              </div>
              <button @click="postSeedSet">Use as Seed Set</button>
            </div>
          </div>
        </div>

        <!-- Div fills up rest of 'page', so the seed set has 
        something over which to slide.-->
        <div></div>
      </div>
    </div>
  </div>
</template>

<script>
import Logo from "./Logo.vue";
import ResultService from "../getResults.js";
import UserTable from "./UserTable.vue";

export default {
  name: "SeedSet",
  components: {
    Logo,
    UserTable,
  },

  data: function() {
    return {
      document: document,
      clickedTables: [],
      selectedRows: [],
      keywords: "",
      results: "",
      errors: []
    };
  },

  methods: {
    submitQuery() {
      /* Submits the keyword query to the backend,
       * assigns the result of the query (after formatting)
       * to the 'results' data
       */
      var changeButton = function(button, content) {
        button.textContent = content;
        button.disabled = !button.disabled;
        button.classList.toggle("deactivate");
      };

      this.errors = [];
      this.selectedRows = [];
      var keywords = this.document.querySelector("#keywords").value; // Only update keywords here, not on change
      var submitButton = this.document.querySelector("#submit-query-button");

      // https://vuejs.org/v2/cookbook/form-validation.html
      if (keywords.length > 0) {
        changeButton(submitButton, "Loading...");
        ResultService.getKeywords(keywords.toLowerCase())
          .then(data => {
            changeButton(submitButton, "Submit Query");
            this.results = data;
            this.keywords = keywords;
          })
          .catch(err => {
            changeButton(submitButton, err);
            console.log(err);
          });
      } else {
        if (this.keywords.length === 0) {
          this.errors.push(
            0
          ); /* Need at least one item, doesn't matter what it is. */
        }
      }
    },

    postSeedSet() {
      /* Set the seed set attribute on the back-end,
       * emit event to change the page's mode */
      var tableIDs = [];
      var rowIDs = [];
      this.selectedRows.forEach(row => {
        tableIDs.push(row["tableID"]);
        rowIDs.push(row["rowID"]);
      });

      ResultService.postSeedSet(rowIDs, tableIDs)
        .then(() => {
          this.$emit("ChangeMode");
        })
        .catch(err => {
          console.log(err);
        });
    },

    logRowInfo(rowContent, rowID, table_id, title) {
      /* Formats the data to be passed to 'selectedRows' */
      return {
        rowContent: rowContent.split(/ *\|\| */),
        rowID: rowID,
        tableID: table_id,
        origin: title
      };
    },

    isTableChecked(table_rank) {
      /* Checks if table checkbox is checked,
       * allows for rendering of rows. */
      return this.clickedTables.indexOf(table_rank) !== -1;
    },

    isTableInSS(table_id) {
      /* Checks if a row from table_id is selected to
       * be in the seed set, if it is we record it in the DOM */
      return this.selectedRows.some(row => row["tableID"] === table_id);
    },

    makeKeywordsBold(str, keywords) {
      /* Make all keywords appear bold in result
       * https://x-team.com/blog/highlight-text-vue-regex/
       * Accessed June 9th, 2020
       */
      return str.replace(new RegExp( `(?<=^|[^a-zA-Z-])(?:${keywords.split(/ *, */).join("|")})(?=[^a-zA-Z-]|$)`,"gi" ), match => {
          return "<strong>" + match + "</strong>";
        }
      );
    }
  },

  computed: {
    table: function() {
      /* Computes the seed-set table from this.selectedRows */
      var rows = [];
      var hidden = [];
      var numRows = 0;
      var numCols = 0;

      this.selectedRows.forEach(row => {
        hidden.push(row["hidden"]);
        row = row["rowContent"];
        numCols = Math.max(row.length, numCols);
        numRows += 1;
        rows.push(row);
      });

      return {
        rows: rows,
        hidden: hidden,
        numRows: numRows,
        numCols: numCols
      };
    }
  }
};
</script>

<style scoped>

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

.table-enter-active,
.table-leave-active {
  opacity: 1;
  font-size: inherit;
  max-height: 999em;
  transition: 0.25s ease;
}

.table-enter,
.table-leave-to {
  opacity: 0;
  max-height: 0;
  font-size: 0;
}

.read-more-trigger {
  cursor: pointer;
  display: inline-block;
  padding: 0 0.5em;
  font-size: 0.95em;
  line-height: 2;
  border: 1px solid #ddd;
  border-radius: 0.25em;
  background: rgb(49, 45, 45);
  margin: 0.1em 0;
}
</style>