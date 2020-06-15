<template>
    <div>
        <table>
            <tbody>
                <tr v-for="(row, row_index) in table" :key="row_index">
                    <td v-for="(cell, col_index) in row" :key="col_index">
                        {{ cell }}
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script>
export default {
    name: 'UserTable',
    props: {
        table: Array,
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