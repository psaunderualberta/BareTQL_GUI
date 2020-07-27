<template>
  <div>
    <div class="centering">
      <Logo />
      <button @click="goBack">Return to Keyword Search</button>
    </div>
    <div class="separate-components centering">
      <h2>Seed Set</h2>
      <hr class='hr-in-separate-components' />

      <div class="centering">
        <!-- Uniqueness checkboxes  -->
        <div class="container">
          <p>Tag unique columns: <br>
            <span @click="colTagClick($event, uniqueCols)" class="col-checkboxes uniqueTags" v-for="col in numCols" :key="col">
              {{ col }}.
            </span>
          </p>
        </div>

        <!-- Deletion checkboxes  -->
        <div class="container">
          <p>Select columns to delete: <br>
            <span @click="colTagClick($event, deletions)" class="col-checkboxes deleteTags" v-for="col in numCols" :key="col">
              {{ col }}.
            </span>
          </p>
          <div class="container" v-if="deletions.length > 0">
            <button
              v-on:submit.prevent
              type="submit"
              @click="deleteCols"
            >Confirm Deletions</button>
          </div>
        </div>

      </div>

      <!-- Sliders -->
      <div class="table">
        <tbody>
          <tr>
            <td v-for="col in numCols" :key="col">
              <p style="margin: 0; text-align: left;">
                {{ col }}.<span v-if="uniqueCols.indexOf(col) !== -1">***</span>
              </p>
              <div>
                <p class="slider-values">{{ stickiness(sliderValues[col - 1]) }}% Sticky</p>
                <input
                  type="range"
                  min="0"
                  max="100"
                  class="slider"
                  v-model="sliderValues[col - 1]"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </div>
      <UserTable :table="table" :allowSelection="true" @swap="swapCells" tableLayout="fixed"/>
      <ButtonList :arr="functions" origin="Operations" @NewClick="executeDotOp" />
      <button
        id="dot-op-submit"
        v-if="dotOp.length !== 0"
        @click="executeDotOp"
        v-on:submit.prevent
      >Confirm Selection</button>

    <!-- Result of Set Expansion -->
      <h2>Result of Set Expansion</h2>
      <hr class="hr-in-separate-components" />
      <h3
        v-if="!bootUp"
      >Expanded Rows: {{ expandedRows['rows'].length }} rows found</h3>
      <h4 v-else>No operation selected</h4>
      <UserTable :table="expandedRows" :downloadable="true" :hoverEffect="true" tableLayout="auto"/>
    </div>
  </div>
</template>

<script>
import Logo from "./Logo.vue";
import ButtonList from "./ButtonList.vue";
import UserTable from "./UserTable.vue";
import ResultService from "../getResults";

export default {
  name: "Operations",
  components: {
    Logo,
    ButtonList,
    UserTable,
  },

  data: function() {
    return {
      functions: [{ message: "Expand Rows (XR)", value: "XR" }],
      expandedRows: { rows: [], info: [] },
      document: document,
      table: {rows: []},
      sliderValues: [],
      uniqueCols: [],
      deletions: [],
      bootUp: true,
      numCols: 0,
      dotOp: ""
    };
  },

  methods: {
    executeDotOp(op) {
      /* Executes the dot op selected by user */
      var changeButtons = function(buttons, content) {
        for (let key in Object.keys(buttons)) {
          buttons[key].textContent = content;
          buttons[key].disabled = !buttons[key].disabled;
          buttons[key].classList.toggle("deactivate");
        }
      };

      var submitButtons = this.document.querySelectorAll(".Operations");
      changeButtons(submitButtons, "Loading Results...");

      ResultService.handleDotOps(op, this.sliderValues, this.uniqueCols)
        .then(data => {
          changeButtons(submitButtons, "Click to perform operation");
          this.bootUp = false;
          this.expandedRows = this.handleResponse(data);
        })
        .catch(err => {
          changeButtons(submitButtons, "An error occurred. Please try again");
          console.log(err);
        });
    },

    deleteCols() {
      /* Deletes all columns that the user has selected */
      ResultService.deleteCols(this.deletions)
        .then(data => {
          this.table = this.handleResponse(data);
          document.querySelectorAll('.deleteTags').forEach(tag => {tag.classList.remove('clicked')})
          this.deletions = [];
        })
        .catch(err => {
          console.log(err);
        });
    },

    handleResponse(data) {
      /* handles the response from the API when receiving a modified seed set */
      var tmp = { rows: [], info: [] };
      this.numCols = 0;
      this.sliderValues = [];

      if (typeof data["sliders"] !== "undefined") {
        for (let i = 0; i < data["sliders"].length; i++) {
          this.sliderValues.push(Number(data["sliders"][i]));
        }

        if (typeof data["info"] !== "undefined") tmp["info"] = data["info"];

        if (data["rows"].length > 0 && data["rows"][0].length > 0) {
          data["rows"].forEach(row => {
            row = row.split(" || ");
            this.numCols = Math.max(this.numCols, row.length);
            tmp["rows"].push(row);
          });
        }
      }

      return tmp;
    },

    swapCells(indices) {
      /* Swaps the two cells selected by the user */
      ResultService.swapCells(indices)
        .then(data => {
          this.table = this.handleResponse(data);
        })
        .catch(err => {
          console.log(err);
        });
    },

    goBack() {
      /* Emits a function to change the screen back to keyword search */
      this.$emit("ChangeMode");
    },

    colTagClick(event, target) {
      /* Add / remove the clicked column 
       * from deletions / uniqueCols */
      var val = Number(event.target.textContent);
      var iO = target.indexOf(val);
      if (iO !== -1) {
        target.splice(iO, 1)
        event.target.classList.remove('clicked')
      } else {
        target.push(val)
        event.target.classList.add('clicked');
      }
      return
    },  

    stickiness(stickyValue) {
      /* Determine 'stickiness' value to be displayed */
      if (typeof stickyValue === "undefined") {
        return 50;
      }
      return stickyValue;
    }
  },

  created() {
    /* Initial call to get the Seed Set from the API */
    ResultService.handleDotOps(undefined, this.sliderValues, this.uniqueCols)
      .then(data => {
        this.table = this.handleResponse(data);
      })
      .catch(err => {
        console.log(err);
      });
  },

  updated() {
    /* Adjusts number of columns when table is updated */
    this.table["rows"].forEach(row => {
      this.numCols = Math.max(row.length, this.numCols);
    });
  }
};
</script>


<style scoped>

p {
  margin: 0;
}

input[type="text"] {
  margin: 1% 2%;
  width: 20%
}

.compress {
  width: 50%;
  justify-content: center;
}

.container {
  padding: 2%;
  margin-bottom: 0.5%;
  display: inline-block;
}

.col-checkboxes {
  padding: 3%;
}

/* https://www.w3schools.com/howto/howto_js_rangeslider.asp */
/* The slider itself */
.slider {
  -webkit-appearance: none;  /* Override default CSS styles */
  appearance: none;
  width: 100%; /* Full-width */
  height: 15px; /* Specified height */
  background: #d3d3d3; /* Grey background */
  outline: none; /* Remove outline */
  opacity: 0.7; /* Set transparency (for mouse-over effects on hover) */
  -webkit-transition: .2s; /* 0.2 seconds transition on hover */
  transition: opacity .2s;
}

/* Mouse-over effects */
.slider:hover {
  opacity: 1; /* Fully shown on mouse-over */
}

/* The slider handle (use -webkit- (Chrome, Opera, Safari, Edge) and -moz- (Firefox) to override default look) */
.slider::-webkit-slider-thumb {
  -webkit-appearance: none; /* Override default look */
  appearance: none;
  width: 15%; /* Set a specific slider handle width */
  height: 15px; /* Slider handle height */
  background: #deb992; /* Green background */
  cursor: pointer; /* Cursor on hover */
}

.slider::-moz-range-thumb {
  width: 15%; /* Set a specific slider handle width */
  height: 15px; /* Slider handle height */
  border-radius: 0;
  background: #deb992; /* Green background */
  cursor: pointer; /* Cursor on hover */
}
</style>