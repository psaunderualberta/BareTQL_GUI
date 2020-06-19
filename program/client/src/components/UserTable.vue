<template>
    <div>
        <table>
            <tbody>
                <tr v-for="(row, row_index) in table" :key="row_index">
                    <td v-for="(cell, col_index) in row" :key="col_index">
                        <div v-if="allowSelection">
                            <input type="checkbox" :id="row_index+'-'+col_index" :value="row_index+'-'+col_index" v-model="selectedCells">
                            <label :for="row_index+'-'+col_index">
                                {{ cell.length === 0 ? 'NULL' : cell }}
                            </label>
                        </div>
                        <div v-else>
                            {{ cell.length === 0 ? 'NULL' : cell }}
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
        {{ selectedCells}}
    </div>
</template>

<script>
export default {
    name: 'UserTable',
    props: {
        table: Array,
        allowSelection: Boolean,
    },
    data: function() {
        return {
            selectedCells: []
        }
    }
}

</script>

<style>

table {
    margin: 0 auto;
    table-layout: fixed;
    width: 95%;
    padding-bottom: 3px;
}

td {
    border: 1px solid grey;
    padding: 2px;
}

</style>