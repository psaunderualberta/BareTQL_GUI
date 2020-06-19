<template>
    <div>
        <div class="separate-components centering">
            <Logo />
            <Instruction ref="instruction-1" index="1" style="padding-bottom: 1%;">
                <template #shown>
                    <button @click="showInstructions">Learn about Part 2 of BareTQL</button>
                </template>

                <template #hidden>
                    <p>
                        This the second part of the BareTQL application, where set expansion occurs. Here, we take the seed set you chose
                        in the previous section and find different rows in the database that match the seed set, based on parameters that you choose.
                    </p>
                </template>
            </Instruction>
     
            <button @click="goBack">Return to Keyword Search</button>
        </div>

        <!--  -->
        <div class="separate-components centering">
            <Instruction ref="instruction-2" index="2" style="padding-bottom: 1%;">
                <template #shown>
                    <h4>Please select one of the operations below</h4>
                </template>

                <template #hidden>
                    <p>
                        These are the operations with which you can expand your seed set. <br>
                        XR adds more rows, XC adds more columns, and Fill fills any null values you may have.
                    </p>
                </template>
            </Instruction>
            <ButtonList :arr="functions" origin="Operations" @NewClick="changeOp"/>
            <button v-if="dotOp.length !== 0" @click="executeDotOp" v-on:submit.prevent >
                Click to perform operation
            </button>
        </div>
        <div class="separate-components centering">
            <h3>Current Table: {{ table.length }} rows, {{ numCols }} columns, {{ nullCount }} null values</h3>

            <div v-if="deletions.length > 0">
                <button v-on:submit.prevent type="submit" @click="deleteCols">Click to delete columns {{ deletions }}</button>
            </div>

            <!-- Deletion buttons, Sliders -->
            <Instruction ref="instruction-3" index="3" style="padding-bottom: 1%;">

                <template #hidden>
                    <p>
                        These are where you can adjust the settings of your seed set. In particular, the slider above each column determines
                        how similar you want the expanded rows to be for that column. 100% means only choose values that are currently in the column, 
                        0% means we can choose any values, and anything in between is a proportion of each.
                    </p>
                </template>
            </Instruction>
            <table>
                <tbody>
                    <tr>
                        <td style="border: none;" v-for="col in numCols" :key="col">
                            <input type="checkbox" :id="'delete'+col" :value="col" v-model="deletions">
                            <label :for="'delete'+col">Delete Column</label>
                        </td>
                    </tr>
                    <tr>
                        <td v-for="col in numCols" :key="col">
                            <p class="slider-values">{{ sliderValues[col - 1] }}%  Sticky</p>
                            <input type="range" min="0" max="100" value="50" class="slider" v-model="sliderValues[col - 1]">
                        </td>
                    </tr>
                </tbody>
            </table>
            <UserTable :table="table" :allowSelection="true" @swap="swapCells" />

        </div>
    </div>
</template>

<script>
import Logo from './Logo.vue'
import ButtonList from './ButtonList.vue'
import UserTable from './UserTable.vue'
import ResultService from '../getResults'
import Instruction from './Instruction.vue'

export default {
    name: 'Operations',
    components: {
        Logo,
        ButtonList,
        UserTable,
        Instruction,
    },

    data: function() {
        return {
            functions: [
                {message: 'Expand Rows (XR)', value: 'XR'},
                {message: 'Expand Columns (XC)', value: 'XC'},
                {message: 'Fill Null Values', value: 'Fill'},
            ],
            numCols: 0,
            dotOp: "",
            nullCount: 0,
            table: [],
            deletions: [],
            sliderValues: [],
            document: document,
        }
    },

    methods: {
        async showInstructions() {
            for (let i = 1; i < document.querySelectorAll('.instruction-component').length + 1; i++) {
                await this.$refs[`instruction-${i}`].handleClick();
            }
        },

        executeDotOp: function() {
            ResultService.handleDotOps(this.dotOp, this.sliderValues)
            .then((data) => {
                this.handleResponse(data);
            })
            .catch((err) => {
                console.log(err);
            })
        },

        deleteCols: function() {
            ResultService.deleteCols(this.deletions)
            .then((data) => {
                this.handleResponse(data)
                this.deletions = [];
            })
            .catch((err) => {
                console.log(err);
            })
        },

        handleResponse: function(data) {
            var cellCount = 0;
            this.table = [];
            this.numCols = 0;
            this.sliderValues = []

            for (let i = 0; i < data['sliders'].length; i++) {
                this.sliderValues.push(Number(data['sliders'][i]) * 5);
            }

            data = data['rows']

            if (data[0].length > 0) {
                data.forEach(row => {
                    row = row.split(' || ') // Hardcoded split, from getResults.js in 'handleResponse'
                    cellCount += row.length;
                    this.numCols = Math.max(this.numCols, row.length);
    
                    this.table.push(row) 
                });
            }

            this.nullCount = this.table.length * this.numCols - cellCount
        },
        changeOp: function(newOp) {
            this.dotOp = newOp;
        },

        swapCells(indices) {
            ResultService.swapCells(indices)
            .then((data) => {
                this.handleResponse(data);
            })
            .catch((err) => {
                console.log(err);
            })
        },

        goBack: function() {
            this.$emit('ChangeMode')
        },

        stickiness(stickyValue) {
            /* Determine 'stickiness' value to be displayed */
            if (typeof stickyValue === 'undefined') {
                return 50
            }
            return stickyValue
        },

    },


    created: function() {
        ResultService.handleDotOps(undefined, this.sliderValues)
        .then((data) => {
            this.handleResponse(data);
        })
        .catch((err) => {
            console.log(err);
        })
    },

    updated: function() {
        this.table.forEach(row => {
            this.numCols = Math.max(row.length, this.numCols)
        })
    }
}
</script>


<style  scoped>


.compress {
    width: 50%;
    justify-content: center;
}

/* https://www.w3schools.com/howto/howto_js_rangeslider.asp */
/* The slider itself */
.slider {
  -webkit-appearance: none;  /* Override default CSS styles */
  appearance: none;
  width: 100%; /* Full-width */
  height: 40%; /* Specified height */
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
  width: 10%; /* Set a specific slider handle width */
  height: 100%; /* Slider handle height */
  background: #4CAF50; /* Green background */
  cursor: pointer; /* Cursor on hover */
}

.slider::-moz-range-thumb {
  width: 10%; /* Set a specific slider handle width */
  height: 100%; /* Slider handle height */
  background: #4CAF50; /* Green background */
  cursor: pointer; /* Cursor on hover */
}


</style>